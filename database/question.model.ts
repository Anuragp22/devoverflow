import { model, models, Schema, Types, Document } from "mongoose";

export interface IQuestion {
  title: string;
  content: string;
  tags: Types.ObjectId[];
  embedding?: number[];
  embeddingText?: string;
  embeddingModel?: string;
  embeddingUpdatedAt?: Date;
  views: number;
  upvotes: number;
  downvotes: number;
  answers: number;
  voteVersion: number;
  author: Types.ObjectId;
}

export interface IQuestionDoc extends IQuestion, Document {}
const QuestionSchema = new Schema<IQuestion>(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    tags: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
    embedding: [{ type: Number }],
    embeddingText: { type: String },
    embeddingModel: { type: String },
    embeddingUpdatedAt: { type: Date },
    views: { type: Number, default: 0 },
    upvotes: { type: Number, default: 0 },
    downvotes: { type: Number, default: 0 },
    answers: { type: Number, default: 0 },
    voteVersion: { type: Number, default: 0 },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

QuestionSchema.index({ title: "text", content: "text" });
QuestionSchema.index({ upvotes: -1, views: -1, createdAt: -1 });
QuestionSchema.index({ author: 1, createdAt: -1 });

const Question =
  models?.Question || model<IQuestion>("Question", QuestionSchema);

export default Question;
