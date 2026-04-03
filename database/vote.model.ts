import { model, models, Schema, Types, Document } from "mongoose";

export interface IVote {
  author: Types.ObjectId;
  actionId: Types.ObjectId;
  actionType: "question" | "answer";
  voteType: "upvote" | "downvote";
}

export interface IVoteDoc extends IVote, Document {}
const VoteSchema = new Schema<IVote>(
  {
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actionId: { type: Schema.Types.ObjectId, required: true },
    actionType: { type: String, enum: ["question", "answer"], required: true },
    voteType: { type: String, enum: ["upvote", "downvote"], required: true },
  },
  { timestamps: true }
);

VoteSchema.index(
  { author: 1, actionType: 1, actionId: 1 },
  { unique: true }
);
VoteSchema.index({ actionType: 1, actionId: 1 });

const Vote = models?.Vote || model<IVote>("Vote", VoteSchema);

export default Vote;
