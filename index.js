const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const admin = require("./admin");
// const Staff = require("../models/Staff");
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
        const userColl = db.collection("users");
        const staffColl = db.collection("staffs");
        const trackingColl = db.collection("trackings");

        // issue tracking APIs
        app.get("/issues/trackings/:id", async (req, res) => {
            const { id } = req.params;
            const query = {};
            if (id) {
                query.issueId = id;
            }

            const result = await trackingColl.find(query).toArray();

            res.send(result);
        });

        app.post("/issues/trackings", async (req, res) => {
            const { issueId, issueStatus } = req.body;
            const newLog = {
                issueId,
                issueStatus,
                createdAt: new Date(),
            };

            const result = await trackingColl.insertOne(newLog);
            res.send(result);
        });

        // users APIs

        app.get("/users", async (req, res) => {
            const { email } = req.query;
            const query = {};
            if (email) {
                query.email = email;
            }

            const result = await userColl.find(query).toArray();
            res.send(result);
        });

        app.post("/users", async (req, res) => {
            const newUser = req.body;
            newUser.createdAt = new Date();
            newUser.isPremium = false;

            const query = { email: newUser.email };

            const userExist = await userColl.findOne(query);

            if (!userExist) {
                const result = await userColl.insertOne(newUser);
                return res.send(result);
            }

            res.send({ message: "user already exists" });
        });

        app.patch("/users/:id", async (req, res) => {
            const updatedInfo = req.body;
            const { id } = req.params;
            const query = { _id: new ObjectId(id) };

            const updatedUser = {
                $set: {
                    displayName: updatedInfo.displayName,
                    photoURL: updatedInfo.photoURL,
                },
            };

            const result = await userColl.updateOne(query, updatedUser);
            res.send(result);
        });

        // staffs APIs

        app.get("/staffs", async (req, res) => {
            const result = await staffColl.find().toArray();
            res.send(result);
        });

        app.post("/admin/create-staff", async (req, res) => {
            try {
                const { name, email, password, phone, photoURL } = req.body;

                // 1️⃣ Create Firebase Auth user (NO LOGIN SWITCH)
                const userRecord = await admin.auth().createUser({
                    email,
                    password,
                    displayName: name,
                    photoURL,
                });

                // 2️⃣ Save staff in DB
                const newStaff = {
                    uid: userRecord.uid,
                    displayName: name,
                    email,
                    phone,
                    photoURL,
                    status: "active",
                    workStatus: "available",
                    createdAt: new Date(),
                };

                const result = await staffColl.insertOne(newStaff);

                res.status(201).send(result);
            } catch (err) {
                res.status(400).send({
                    message: err.message,
                });
            }
        });

        app.post("/staffs", async (req, res) => {
            const newStaff = req.body;
            newStaff.createdAt = new Date();
            newStaff.status = "pending";
            newStaff.workStatus = "unavailable";

            const query = { email: newStaff.email };

            const staffExist = await staffColl.findOne(query);

            if (!staffExist) {
                const result = await staffColl.insertOne(newStaff);
                return res.send(result);
            }

            res.send({ message: "already registered as a staff" });
        });

        // issues APIs
        app.get("/issues", async (req, res) => {
            const { limit, skip, search, category, email } = req.query;
            const query = {};

            if (email) {
                query["reportedBy.email"] = email;
            }

            if (category) {
                query.category = category;
            }

            if (search) {
                query.$or = [
                    { title: { $regex: search, $options: "i" } },
                    // { category: { $regex: search, $options: "i" } },
                    { location: { $regex: search, $options: "i" } },
                ];
            }

            const cursor = issueColl
                .find(query)
                .limit(Number(limit))
                .skip(Number(skip));
            const result = await cursor.toArray();

            const totalIssues = await issueColl.countDocuments(query);

            res.send({ result, total: totalIssues });
        });

        app.get("/issues/:id", async (req, res) => {
            const issueId = req.params.id;
            const query = { _id: new ObjectId(issueId) };
            const result = await issueColl.findOne(query);

            res.send(result);
        });

        app.get("/latest-issues", async (req, res) => {
            const status = req.query.status;
            const query = {};

            if (status) {
                query.status = status;
            }

            const cursor = issueColl
                .find(query)
                .sort({ updatedAt: -1 })
                .limit(6);
            const result = await cursor.toArray();

            res.send(result);
        });

        app.post("/issues", async (req, res) => {
            const issueData = req.body;
            const now = new Date();

            const newIssue = {
                title: issueData.title,
                description: issueData.description,
                category: issueData.category,

                status: "pending",
                priority: "low",
                isBoosted: "false",
                upvoteCount: 0,

                reportedBy: {
                    email: issueData.email,
                    name: issueData.name,
                },

                assignedStaff: {
                    email: null,
                    name: null,
                },

                image: issueData.image,
                location: issueData.location,

                createdAt: now,
                updatedAt: now,
            };

            const result = await issueColl.insertOne(newIssue);
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
