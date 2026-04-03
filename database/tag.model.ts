import { model, models, Schema, Document } from "mongoose";

export interface ITag {
  name: string;
  questions: number;
}

export interface ITagDoc extends ITag, Document {}
const TagSchema = new Schema<ITag>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    questions: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

TagSchema.index({ questions: -1, createdAt: -1 });

const Tag = models?.Tag || model<ITag>("Tag", TagSchema);

export default Tag;
