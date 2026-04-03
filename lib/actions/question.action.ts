"use server";

import mongoose, {
  ClientSession,
  FilterQuery,
  PipelineStage,
  SortOrder,
} from "mongoose";

import {
  Answer,
  Collection,
  Question,
  Tag,
  TagQuestion,
  Vote,
} from "@/database";
import { IQuestionDoc } from "@/database/question.model";
import { ITagDoc } from "@/database/tag.model";
import {
  generateQuestionEmbedding,
  generateSearchEmbedding,
} from "@/lib/search/embeddings";
import { getUniqueTagNames } from "@/lib/tags";

import action from "../handlers/action";
import handleError from "../handlers/error";
import dbConnect from "../mongoose";
import {
  AskQuestionSchema,
  DeleteQuestionSchema,
  EditQuestionSchema,
  GetQuestionSchema,
  IncrementViewsSchema,
  PaginatedSearchParamsSchema,
} from "../validations";

const QUESTION_VECTOR_INDEX = process.env.MONGODB_VECTOR_INDEX;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSortCriteria(filter?: string): Record<string, SortOrder> {
  switch (filter) {
    case "newest":
      return { createdAt: -1 };
    case "unanswered":
      return { createdAt: -1 };
    case "popular":
      return { upvotes: -1, views: -1 };
    case "recommended":
      return { searchScore: -1, upvotes: -1, views: -1, createdAt: -1 };
    default:
      return { createdAt: -1 };
  }
}

async function upsertTags(tagNames: string[], session: ClientSession) {
  if (tagNames.length === 0) return [];

  await Tag.bulkWrite(
    tagNames.map((name) => ({
      updateOne: {
        filter: { name },
        update: {
          $setOnInsert: { name },
          $inc: { questions: 1 },
        },
        upsert: true,
      },
    })),
    { session, ordered: false }
  );

  return Tag.find({ name: { $in: tagNames } }).session(session);
}

async function decrementTags(
  tagIds: mongoose.Types.ObjectId[],
  session: ClientSession
) {
  if (tagIds.length === 0) return;

  await Tag.updateMany(
    { _id: { $in: tagIds } },
    { $inc: { questions: -1 } },
    { session }
  );

  await Tag.deleteMany({
    _id: { $in: tagIds },
    questions: { $lte: 0 },
  }).session(session);
}

async function getKeywordQuestions(
  params: PaginatedSearchParams
): Promise<QuestionSearchResult> {
  const { page = 1, pageSize = 10, query, filter } = params;
  const skip = (Number(page) - 1) * Number(pageSize);
  const limit = Number(pageSize);

  const filterQuery: FilterQuery<typeof Question> = {};

  if (filter === "unanswered") {
    filterQuery.answers = 0;
  }

  if (query) {
    const safeQuery = new RegExp(escapeRegex(query), "i");
    filterQuery.$or = [{ title: safeQuery }, { content: safeQuery }];
  }

  const totalQuestions = await Question.countDocuments(filterQuery);

  const questions = await Question.find(filterQuery)
    .populate("tags", "name")
    .populate("author", "name image")
    .lean()
    .sort(getSortCriteria(filter))
    .skip(skip)
    .limit(limit);

  const isNext = totalQuestions > skip + questions.length;
  const normalizedQuery = query?.toLowerCase().trim() || "";
  const scores = questions.reduce<Record<string, number>>((acc, question) => {
    if (!normalizedQuery) {
      acc[String(question._id)] = 0;
      return acc;
    }

    const titleScore = question.title.toLowerCase().includes(normalizedQuery)
      ? 0.6
      : 0;
    const contentScore = question.content
      .toLowerCase()
      .includes(normalizedQuery)
      ? 0.2
      : 0;
    const engagementScore = Math.min(
      0.2,
      question.upvotes * 0.01 + question.answers * 0.02 + question.views * 0.001
    );

    acc[String(question._id)] = Number(
      (titleScore + contentScore + engagementScore).toFixed(4)
    );
    return acc;
  }, {});

  return {
    questions: JSON.parse(JSON.stringify(questions)),
    isNext,
    searchMode: query ? "keyword" : "none",
    scores,
  };
}

async function getHybridQuestions(
  params: PaginatedSearchParams
): Promise<QuestionSearchResult | null> {
  const { page = 1, pageSize = 10, semanticQuery, filter } = params;

  if (!semanticQuery || !QUESTION_VECTOR_INDEX) return null;

  const queryVector = await generateSearchEmbedding(semanticQuery);

  if (!queryVector) return null;

  const skip = (Number(page) - 1) * Number(pageSize);
  const limit = Number(pageSize);
  const safeQuery = escapeRegex(semanticQuery);
  const pipeline: PipelineStage[] = [
    {
      $vectorSearch: {
        index: QUESTION_VECTOR_INDEX,
        path: "embedding",
        queryVector,
        numCandidates: Math.max(150, (skip + limit + 1) * 10),
        limit: Math.max(50, (skip + limit + 1) * 4),
      },
    } as PipelineStage,
  ];

  if (filter === "unanswered") {
    pipeline.push({ $match: { answers: 0 } });
  }

  pipeline.push(
    {
      $addFields: {
        semanticScore: { $meta: "vectorSearchScore" },
        keywordScore: {
          $add: [
            {
              $cond: [
                {
                  $regexMatch: {
                    input: "$title",
                    regex: safeQuery,
                    options: "i",
                  },
                },
                0.35,
                0,
              ],
            },
            {
              $cond: [
                {
                  $regexMatch: {
                    input: "$content",
                    regex: safeQuery,
                    options: "i",
                  },
                },
                0.15,
                0,
              ],
            },
          ],
        },
        engagementScore: {
          $min: [
            0.2,
            {
              $add: [
                { $multiply: ["$upvotes", 0.01] },
                { $multiply: ["$answers", 0.02] },
                { $multiply: ["$views", 0.001] },
              ],
            },
          ],
        },
      },
    },
    {
      $addFields: {
        searchScore: {
          $add: ["$semanticScore", "$keywordScore", "$engagementScore"],
        },
      },
    },
    {
      $sort: {
        searchScore: -1,
        ...getSortCriteria(filter || "recommended"),
      },
    },
    { $skip: skip },
    { $limit: limit + 1 }
  );

  try {
    const rawQuestions = await Question.aggregate(pipeline);
    const questions = await Question.populate(rawQuestions.slice(0, limit), [
      { path: "tags", select: "name" },
      { path: "author", select: "name image" },
    ]);

    const scores = rawQuestions.slice(0, limit).reduce<Record<string, number>>(
      (acc, question) => {
        acc[String(question._id)] = Number(
          (question.searchScore || 0).toFixed(4)
        );
        return acc;
      },
      {}
    );

    return {
      questions: JSON.parse(JSON.stringify(questions)),
      isNext: rawQuestions.length > limit,
      searchMode: "hybrid",
      scores,
    };
  } catch (error) {
    console.error("[Question Search] Vector search unavailable:", error);
    return null;
  }
}

export async function createQuestion(
  params: CreateQuestionParams
): Promise<ActionResponse<Question>> {
  const validationResult = await action({
    params,
    schema: AskQuestionSchema,
    authorize: true,
  });

  if (validationResult instanceof Error) {
    return handleError(validationResult) as ErrorResponse;
  }

  const { title, content, tags } = validationResult.params!;
  const userId = validationResult?.session?.user?.id;
  const tagNames = getUniqueTagNames(tags);

  if (tagNames.length === 0) {
    return handleError(
      new Error("At least one valid tag is required")
    ) as ErrorResponse;
  }

  const embeddingPayload = await generateQuestionEmbedding({
    title,
    content,
    tags: tagNames,
  });

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [question] = await Question.create(
      [{ title, content, author: userId, ...embeddingPayload }],
      { session }
    );

    if (!question) {
      throw new Error("Failed to create question");
    }

    const questionTags = await upsertTags(tagNames, session);
    const tagIds = questionTags.map(
      (tag) => tag._id as mongoose.Types.ObjectId
    );

    await TagQuestion.insertMany(
      tagIds.map((tagId) => ({
        tag: tagId,
        question: question._id,
      })),
      { session, ordered: false }
    );

    await Question.findByIdAndUpdate(
      question._id,
      { $push: { tags: { $each: tagIds } } },
      { session }
    );

    await session.commitTransaction();

    return { success: true, data: JSON.parse(JSON.stringify(question)) };
  } catch (error) {
    await session.abortTransaction();
    return handleError(error) as ErrorResponse;
  } finally {
    await session.endSession();
  }
}

export async function editQuestion(
  params: EditQuestionParams
): Promise<ActionResponse<IQuestionDoc>> {
  const validationResult = await action({
    params,
    schema: EditQuestionSchema,
    authorize: true,
  });

  if (validationResult instanceof Error) {
    return handleError(validationResult) as ErrorResponse;
  }

  const { title, content, tags, questionId } = validationResult.params!;
  const userId = validationResult?.session?.user?.id;
  const nextTagNames = getUniqueTagNames(tags);

  if (nextTagNames.length === 0) {
    return handleError(
      new Error("At least one valid tag is required")
    ) as ErrorResponse;
  }

  const embeddingPayload = await generateQuestionEmbedding({
    title,
    content,
    tags: nextTagNames,
  });

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const question = await Question.findById(questionId)
      .populate("tags")
      .session(session);

    if (!question) {
      throw new Error("Question not found");
    }

    if (question.author.toString() !== userId) {
      throw new Error("Unauthorized");
    }

    if (question.title !== title || question.content !== content) {
      question.title = title;
      question.content = content;
      await question.save({ session });
    }

    const currentTags = question.tags as unknown as ITagDoc[];
    const currentTagNames = currentTags.map((tag) => tag.name);
    const tagsToAdd = nextTagNames.filter(
      (tagName) => !currentTagNames.includes(tagName)
    );

    const tagsToRemove = currentTags.filter(
      (tag: ITagDoc) => !nextTagNames.some((tagName) => tagName === tag.name)
    );

    const nextTagIds = currentTags
      .filter(
        (tag) =>
          !tagsToRemove.some(
            (removed) => String(removed._id) === String(tag._id)
          )
      )
      .map((tag) => tag._id as mongoose.Types.ObjectId);

    if (tagsToAdd.length > 0) {
      const addedTags = await upsertTags(tagsToAdd, session);
      nextTagIds.push(
        ...addedTags.map((tag) => tag._id as mongoose.Types.ObjectId)
      );

      await TagQuestion.insertMany(
        addedTags.map((tag) => ({
          tag: tag._id,
          question: questionId,
        })),
        { session, ordered: false }
      );
    }

    if (tagsToRemove.length > 0) {
      const tagIdsToRemove = tagsToRemove.map(
        (tag: ITagDoc) => tag._id as mongoose.Types.ObjectId
      );

      await decrementTags(tagIdsToRemove, session);

      await TagQuestion.deleteMany(
        { tag: { $in: tagIdsToRemove }, question: questionId },
        { session }
      );
    }

    question.tags = nextTagIds;
    question.title = title;
    question.content = content;

    if (embeddingPayload.embeddingText) {
      question.embeddingText = embeddingPayload.embeddingText;
    }

    if (embeddingPayload.embedding) {
      question.embedding = embeddingPayload.embedding;
      question.embeddingModel = embeddingPayload.embeddingModel;
      question.embeddingUpdatedAt = embeddingPayload.embeddingUpdatedAt;
    }

    await question.save({ session });
    await session.commitTransaction();

    return { success: true, data: JSON.parse(JSON.stringify(question)) };
  } catch (error) {
    await session.abortTransaction();
    return handleError(error) as ErrorResponse;
  } finally {
    await session.endSession();
  }
}

export async function getQuestion(
  params: GetQuestionParams
): Promise<ActionResponse<Question>> {
  const validationResult = await action({
    params,
    schema: GetQuestionSchema,
  });

  if (validationResult instanceof Error) {
    return handleError(validationResult) as ErrorResponse;
  }

  const { questionId } = validationResult.params!;

  try {
    const question = await Question.findById(questionId)
      .populate("tags")
      .populate("author", "_id name image");

    if (!question) {
      throw new Error("Question not found");
    }

    return { success: true, data: JSON.parse(JSON.stringify(question)) };
  } catch (error) {
    return handleError(error) as ErrorResponse;
  }
}

export async function getQuestions(
  params: PaginatedSearchParams
): Promise<ActionResponse<QuestionSearchResult>> {
  const validationResult = await action({
    params,
    schema: PaginatedSearchParamsSchema,
  });

  if (validationResult instanceof Error) {
    return handleError(validationResult) as ErrorResponse;
  }

  try {
    if (params.query) {
      return {
        success: true,
        data: await getKeywordQuestions(params),
      };
    }

    const hybridResult = await getHybridQuestions(params);

    return {
      success: true,
      data:
        hybridResult ||
        (await getKeywordQuestions({
          ...params,
          query: params.semanticQuery || params.query,
        })),
    };
  } catch (error) {
    return handleError(error) as ErrorResponse;
  }
}

export async function deleteQuestion(
  params: DeleteQuestionParams
): Promise<ActionResponse> {
  const validationResult = await action({
    params,
    schema: DeleteQuestionSchema,
    authorize: true,
  });

  if (validationResult instanceof Error) {
    return handleError(validationResult) as ErrorResponse;
  }

  const { questionId } = validationResult.params!;
  const userId = validationResult.session?.user?.id;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const question = await Question.findById(questionId).session(session);

    if (!question) throw new Error("Question not found");

    if (question.author.toString() !== userId) {
      throw new Error("Unauthorized");
    }

    const answerIds = await Answer.find({ question: question._id })
      .select("_id")
      .session(session);
    const answerObjectIds = answerIds.map((answer) => answer._id);

    await Vote.deleteMany({
      $or: [
        { actionType: "question", actionId: question._id },
        { actionType: "answer", actionId: { $in: answerObjectIds } },
      ],
    }).session(session);

    await Answer.deleteMany({ question: question._id }).session(session);
    await Collection.deleteMany({ question: question._id }).session(session);
    await TagQuestion.deleteMany({ question: question._id }).session(session);
    await decrementTags(question.tags as mongoose.Types.ObjectId[], session);
    await Question.deleteOne({ _id: question._id }).session(session);

    await session.commitTransaction();

    return { success: true };
  } catch (error) {
    await session.abortTransaction();
    return handleError(error) as ErrorResponse;
  } finally {
    await session.endSession();
  }
}

export async function incrementViews(
  params: IncrementViewsParams
): Promise<ActionResponse<{ views: number }>> {
  const validationResult = await action({
    params,
    schema: IncrementViewsSchema,
  });

  if (validationResult instanceof Error) {
    return handleError(validationResult) as ErrorResponse;
  }

  const { questionId } = validationResult.params!;

  try {
    const question = await Question.findById(questionId);

    if (!question) {
      throw new Error("Question not found");
    }

    question.views += 1;

    await question.save();

    return {
      success: true,
      data: { views: question.views },
    };
  } catch (error) {
    return handleError(error) as ErrorResponse;
  }
}

export async function getHotQuestions(): Promise<ActionResponse<Question[]>> {
  try {
    await dbConnect();

    const questions = await Question.find()
      .sort({ views: -1, upvotes: -1 })
      .limit(5);

    return {
      success: true,
      data: JSON.parse(JSON.stringify(questions)),
    };
  } catch (error) {
    return handleError(error) as ErrorResponse;
  }
}
