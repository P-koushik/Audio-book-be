import { Pdf_md } from "@/models/pdf-markdown"
import { PDf_System_prompt } from "@/prompts/pdf-text-correction"
import { generateText } from "ai"

export const text_correction = async (pdf_id: string): Promise<void> => {
    const md = await Pdf_md.findById(pdf_id)
    const md_text = md.markdown

    const responce = await generateText({
        model:"mistral/mistral-small",
        prompt: PDf_System_prompt
    })
}