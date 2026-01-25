import { Request, Response } from "express";

export const upload_pdf = async (req:Request , res:Response)=>{
    res.send(
        {
            message:"pdf uploaded successfully",
        }
    )
}