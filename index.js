const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.iq0iryo.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

async function run() {
    try {
        const db = client.db("civic_connect");
        const issueColl = db.collection("issues");

        // issues APIs
        app.get("/issues", async (req, res) => {
            const cursor = issueColl.find();
            const result = await cursor.toArray();

            res.send(result);
        });

        app.get("/issues/:id", async (req, res) => {
            const issueId = req.params.id;
            const query = { _id: new ObjectId(issueId) };
            const result = await issueColl.findOne(query);

            res.send(result);
        });

        

        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log(
            "Pinged your deployment. You successfully connected to MongoDB!"
        );
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get("/", (req, res) => {
    res.send("hello exress!");
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
