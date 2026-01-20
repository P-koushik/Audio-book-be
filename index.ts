import mongoose from "mongoose"
import express from "express"
import { env } from "./constants/env"

const app = express()

if (!env.MONGO_URL) {
    console.log("MONGO_URL environment variable is not set")
}

mongoose.connect(env.MONGO_URL).then(() => {
    console.log("Mongo Db is connected")
}).catch((error) => {
    console.log(error)
})

app.use(express.json())

app.listen(env.PORT, () => {
    console.log(`Server is running in port ${env.PORT}`)
})
