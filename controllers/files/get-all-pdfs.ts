import { Request, Response } from "express";

export const get_all_pdf = async (req:Request , res:Response)=>{
    res.send(
        {
            message:"All pdf's fetched successfully",
            data:["dsfas"]
        }
    )
}