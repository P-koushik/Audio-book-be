import mongoose, { Schema, model } from "mongoose"
import { TUser } from "../types/user"

const user_schema = new Schema<TUser>(
    {
        email: { type: String, required: true, unique: true },
        name: { type: String, required: true }
    }, {
    timestamps: true
})

export const User = mongoose.models.User || model<TUser>('User', user_schema)