import { Request, Response } from "express";

export const get_pdf_by_id = async (req:Request , res:Response)=>{
    res.send(
        {
            message:"pdf id fetched successfully",
            data:["dsfas"]
        }
    )
}