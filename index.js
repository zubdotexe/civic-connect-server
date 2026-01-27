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

const verifyFirebaseToken = async (req, res, next) => {
    const token = req.headers.authorization;

    if (!token) {
        return res.status(401).send({ message: "unauthorized access" });
    }

    try {
        const idToken = token.split(" ")[1];
        const decoded = await admin.auth().verifyIdToken(idToken);
        req.decoded_email = decoded.email;
    } catch (err) {
        return res.status(401).send({ message: "unauthorized access" });
    }

    next();
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.iq0iryo.mongodb.net/?appName=Cluster0`;
const stripe = require("stripe")(process.env.STRIPE_SECRET);

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
        const paymentColl = db.collection("payments");

        const verifyAdminToken = async (req, res, next) => {
            const email = req.decoded_email;
            const query = { email };
            const user = await staffColl.findOne(query);

            if (!user || user.role !== "admin") {
                return res.status(403).send({ message: "forbidden access" });
            }

            next();
        };

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

        app.post("/issues/trackings", verifyFirebaseToken, async (req, res) => {
            const { issueId, issueStatus, issueNote } = req.body;
            const newLog = {
                issueId,
                issueStatus,
                issueNote,
                createdAt: new Date(),
            };

            const result = await trackingColl.insertOne(newLog);
            res.send(result);
        });

        // users APIs

        app.get("/users", verifyFirebaseToken, async (req, res) => {
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
            newUser.role = "user";

            const query = { email: newUser.email };

            const userExist = await userColl.findOne(query);

            if (!userExist) {
                const result = await userColl.insertOne(newUser);
                return res.send(result);
            }

            res.send({ message: "user already exists" });
        });

        app.patch("/users/:id", verifyFirebaseToken, async (req, res) => {
            // const updatedInfo = req.body;
            const { id } = req.params;
            const query = { _id: new ObjectId(id) };
            const updates = {};

            if (req.body.displayName !== undefined) {
                updates.displayName = req.body.displayName;
            }

            if (req.body.photoURL !== undefined) {
                updates.photoURL = req.body.photoURL;
            }

            if (req.body.isBlocked !== undefined) {
                updates.isBlocked = req.body.isBlocked;
            }

            // const updatedUser = {
            //     $set: {
            //         displayName: updatedInfo.displayName,
            //         photoURL: updatedInfo.photoURL,
            //     },
            // };

            const result = await userColl.updateOne(query, { $set: updates });
            res.send(result);
        });

        // staffs APIs

        app.get("/staffs", verifyFirebaseToken, async (req, res) => {
            const { workStatus, email } = req.query;
            const query = {};

            if (workStatus) {
                query.workStatus = workStatus;
            }

            if (email) {
                query.email = email;
            }

            const result = await staffColl.find(query).toArray();
            res.send(result);
        });

        app.post(
            "/admin/create-staff",
            verifyFirebaseToken,
            verifyAdminToken,
            async (req, res) => {
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
                        role: "staff",
                        createdAt: new Date(),
                    };

                    const result = await staffColl.insertOne(newStaff);

                    res.status(201).send(result);
                } catch (err) {
                    res.status(400).send({
                        message: err.message,
                    });
                }
            },
        );

        // app.post("/staffs", async (req, res) => {
        //     const newStaff = req.body;
        //     newStaff.createdAt = new Date();
        //     newStaff.status = "pending";
        //     newStaff.workStatus = "unavailable";

        //     const query = { email: newStaff.email };

        //     const staffExist = await staffColl.findOne(query);

        //     if (!staffExist) {
        //         const result = await staffColl.insertOne(newStaff);
        //         return res.send(result);
        //     }

        //     res.send({ message: "already registered as a staff" });
        // });

        app.patch("/staffs/:id", verifyFirebaseToken, async (req, res) => {
            const { id } = req.params;
            const query = { _id: new ObjectId(id) };
            const updatedInfo = req.body;

            const staffExist = await staffColl.findOne(query);

            if (!staffExist) {
                return res.send({ message: "staff does not exist" });
            }

            const updatedStaff = {
                $set: updatedInfo,
            };

            const result = await staffColl.updateOne(query, updatedStaff);

            res.send(result);
        });

        app.delete(
            "/staffs/:id",
            verifyFirebaseToken,
            verifyAdminToken,
            async (req, res) => {
                const { id } = req.params;
                const query = { _id: new ObjectId(id) };

                const result = await staffColl.deleteOne(query);
                res.send(result);
            },
        );

        app.get("/user/role/:email", verifyFirebaseToken, async (req, res) => {
            const { email } = req.params;
            const query = { email: email };

            const staff = await staffColl.findOne(query);

            if (staff) {
                return res.send({ role: staff.role || "staff" });
            }

            const user = await userColl.findOne(query);

            if (user) {
                return res.send({ role: user.role || "user" });
            }

            res.send({ message: "user not found" });
        });

        // issues APIs
        app.get("/issues", async (req, res) => {
            const {
                limit,
                skip,
                search,
                category,
                email,
                staffEmail,
                status,
                exceptStatus,
            } = req.query;
            const query = {};

            if (status) {
                query.status = status;
            }

            if (exceptStatus) {
                query.status = {
                    $ne: exceptStatus,
                };
            }

            if (email) {
                query["reportedBy.email"] = email;
            }

            if (staffEmail) {
                query["assignedStaff.email"] = staffEmail;
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
                .sort({ isBoosted: -1, createdAt: 1 })
                .limit(Number(limit))
                .skip(Number(skip));
            const result = await cursor.toArray();

            const totalIssues = await issueColl.countDocuments(query);

            res.send({ result, total: totalIssues });
        });

        app.get("/issues/:id", verifyFirebaseToken, async (req, res) => {
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

        app.post("/issues", verifyFirebaseToken, async (req, res) => {
            const issueData = req.body;
            const now = new Date();

            const newIssue = {
                title: issueData.title,
                description: issueData.description,
                category: issueData.category,

                status: "pending",
                priority: "normal",
                isBoosted: false,
                upvotes: [],

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

        app.patch("/issues/:id", verifyFirebaseToken, async (req, res) => {
            const { id } = req.params;
            const updatedInfo = req.body;

            const query = { _id: new ObjectId(id) };

            const updates = {};
            if (updatedInfo.name) {
                updates["assignedStaff.name"] = updatedInfo.name;
            }

            if (updatedInfo.email) {
                updates["assignedStaff.email"] = updatedInfo.email;
            }

            if (updatedInfo.title) {
                updates.title = updatedInfo.title;
            }

            if (updatedInfo.description) {
                updates.description = updatedInfo.description;
            }

            if (updatedInfo.photoURL) {
                updates.image = updatedInfo.photoURL;
            }

            if (updatedInfo.category) {
                updates.category = updatedInfo.category;
            }

            if (updatedInfo.location) {
                updates.location = updatedInfo.location;
            }

            const result = await issueColl.updateOne(query, { $set: updates });

            res.send(result);
        });

        app.patch(
            "/issues/:id/change-status",
            verifyFirebaseToken,
            async (req, res) => {
                const { id } = req.params;
                const update = req.body;

                const query = { _id: new ObjectId(id) };
                const updatedStatus = {
                    $set: {
                        status: update.status,
                        updatedAt: new Date(),
                    },
                };

                const result = await issueColl.updateOne(query, updatedStatus);

                const newLog = {
                    issueId: update.issueId,
                    issueStatus: update.issueStatus,
                    issueNote: update.issueNote,
                    createdAt: new Date(),
                };

                const trackingResult = await trackingColl.insertOne(newLog);
                res.send(result);
            },
        );

        app.patch(
            "/issues/:id/upvote",
            verifyFirebaseToken,
            async (req, res) => {
                const { id } = req.params;
                const { userEmail } = req.body;

                const query = {
                    _id: new ObjectId(id),
                    "reportedBy.email": { $ne: userEmail },
                    upvotes: { $ne: userEmail },
                };

                const update = {
                    $addToSet: { upvotes: userEmail },
                };

                const result = await issueColl.updateOne(query, update);

                if (result.matchedCount === 0) {
                    return res.send({
                        message:
                            "Already upvoted or cannot upvote your own issue",
                        alreadyUpvoted: true,
                    });
                }

                const updatedIssue = await issueColl.findOne({
                    _id: new ObjectId(id),
                });

                res.send({
                    message: "Upvoted successfully",
                    alreadyUpvoted: false,
                    totalUpvotes: updatedIssue.upvotes.length,
                });
            },
        );

        app.delete("/issues/:id", verifyFirebaseToken, async (req, res) => {
            const { id } = req.params;

            const query = { _id: new ObjectId(id) };

            const result = await issueColl.deleteOne(query);

            res.send(result);
        });

        // payments related APIs

        app.get("/payments", verifyFirebaseToken, async (req, res) => {
            const { userEmail } = req.query;
            const query = {};
            if (userEmail) {
                query.userEmail = userEmail;
            }
            const result = await paymentColl.find(query).toArray();
            res.send(result);
        });

        app.post(
            "/payments/subscribe/checkout",
            verifyFirebaseToken,
            async (req, res) => {
                try {
                    // const user = req.user;
                    const user = req.body;

                    const session = await stripe.checkout.sessions.create({
                        mode: "payment",
                        line_items: [
                            {
                                price_data: {
                                    currency: "bdt",
                                    product_data: {
                                        name: "CivicConnect Premium Subscription",
                                        description:
                                            "Unlimited issue reporting & priority features",
                                    },
                                    unit_amount: 100 * 1000, // 1 taka = 100 poysha
                                },
                                quantity: 1,
                            },
                        ],

                        customer_email: user.email,

                        metadata: {
                            userEmail: user.email,
                            type: "SUBSCRIPTION",
                            amount: 1000,
                        },

                        success_url: `${process.env.CLIENT_URL}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                        cancel_url: `${process.env.CLIENT_URL}/dashboard/payment-cancelled`,
                    });

                    res.send({
                        url: session.url,
                    });
                } catch (err) {
                    console.error("checkout session error:", err);
                    res.status(500).send({
                        message: "failed to create checkout session",
                    });
                }
            },
        );

        app.patch(
            "/update-subscription",
            verifyFirebaseToken,
            async (req, res) => {
                try {
                    const { sessionId } = req.body;

                    const session =
                        await stripe.checkout.sessions.retrieve(sessionId);
                    if (session.payment_status === "paid") {
                        const userEmail = session.metadata.userEmail;

                        const userQuery = { email: userEmail };
                        const update = { $set: { isPremium: true } };
                        await userColl.updateOne(userQuery, update);

                        // Insert payment information with an atomic check (upsert)
                        const paymentInfo = {
                            sessionId,
                            type: session.metadata.type,
                            userEmail: userEmail,
                            amount: session.metadata.amount,
                            createdAt: new Date(),
                        };

                        const result = await paymentColl.findOneAndUpdate(
                            { sessionId: sessionId }, // Check for existing sessionId
                            { $setOnInsert: paymentInfo }, // Insert only if not found
                            { upsert: true }, // Perform upsert (insert if not found)
                        );

                        res.send({
                            success: true,
                            message: "subscription updated to premium",
                        });
                    } else {
                        res.status(400).send({
                            success: false,
                            message: "payment failed",
                        });
                    }
                } catch (err) {
                    console.error("error updating subscription:", err);
                    res.status(500).send({
                        success: false,
                        message: "failed to update subscription",
                    });
                }
            },
        );

        app.post(
            "/payments/boost-issue/checkout",
            verifyFirebaseToken,
            async (req, res) => {
                try {
                    // const user = req.user;
                    const boostInfo = req.body;

                    const session = await stripe.checkout.sessions.create({
                        mode: "payment",
                        line_items: [
                            {
                                price_data: {
                                    currency: "bdt",
                                    product_data: {
                                        name: "CivicConnect Issue Boost",
                                        description:
                                            "Boosted issues get high priority!",
                                    },
                                    unit_amount: 100 * 100, // 1 taka = 100 poysha
                                },
                                quantity: 1,
                            },
                        ],

                        customer_email: boostInfo.email,

                        metadata: {
                            userEmail: boostInfo.email,
                            issueId: boostInfo.issueId,
                            type: "PAYMENT",
                            amount: 100,
                        },

                        success_url: `${process.env.CLIENT_URL}/dashboard/boost-success?session_id={CHECKOUT_SESSION_ID}`,
                        cancel_url: `${process.env.CLIENT_URL}/dashboard/payment-cancelled`,
                    });

                    res.send({
                        url: session.url,
                    });
                } catch (err) {
                    console.error("checkout session error:", err);
                    res.status(500).send({
                        message: "failed to create checkout session",
                    });
                }
            },
        );

        app.patch("/update-boost", verifyFirebaseToken, async (req, res) => {
            try {
                const { sessionId } = req.body;

                const session =
                    await stripe.checkout.sessions.retrieve(sessionId);
                if (session.payment_status === "paid") {
                    const issueId = session.metadata.issueId;

                    const issueQuery = { _id: new ObjectId(issueId) };
                    const update = {
                        $set: { isBoosted: true, priority: "high" },
                    };
                    await issueColl.updateOne(issueQuery, update);

                    // Insert payment information with an atomic check (upsert)
                    const paymentInfo = {
                        sessionId,
                        type: session.metadata.type,
                        userEmail: session.metadata.userEmail,
                        issueId: session.metadata.issueId,
                        amount: session.metadata.amount,
                        createdAt: new Date(),
                    };

                    const result = await paymentColl.findOneAndUpdate(
                        { sessionId: sessionId }, // Check for existing sessionId
                        { $setOnInsert: paymentInfo }, // Insert only if not found
                        { upsert: true }, // Perform upsert (insert if not found)
                    );

                    const text = "Issue boosted";
                    const newLog = {
                        issueId,
                        issueNote: text,
                        createdAt: new Date(),
                    };

                    const trackingResult = await trackingColl.findOneAndUpdate(
                        { issueId: issueId, issueNote: text },
                        { $setOnInsert: newLog },
                        { upsert: true },
                    );

                    res.send({
                        success: true,
                        message: "issue bossted successfully",
                    });
                } else {
                    res.status(400).send({
                        success: false,
                        message: "payment failed",
                    });
                }
            } catch (err) {
                console.error("error boosting issue:", err);
                res.status(500).send({
                    success: false,
                    message: "failed to boost issue",
                });
            }
        });

        // stats related APIs
        app.get("/stats/users", verifyFirebaseToken, async (req, res) => {
            const { email } = req.query;

            // issues stats
            const issuePipeline = [
                {
                    $match: {
                        "reportedBy.email": email,
                    },
                },
                {
                    $group: {
                        _id: "$status",
                        count: { $sum: 1 },
                    },
                },
            ];

            const issueStats = await issueColl
                .aggregate(issuePipeline)
                .toArray();

            const totalIssues = issueStats.reduce(
                (sum, item) => sum + item.count,
                0,
            );

            const byStatus = {};

            issueStats.forEach((item) => {
                byStatus[item._id] = item.count;
            });

            // payment stats
            const paymentPipeline = [
                {
                    $match: {
                        userEmail: email,
                    },
                },
                {
                    $group: {
                        _id: null,
                        totalPaid: { $sum: { $toDouble: "$amount" } },
                    },
                },
            ];

            const paymentStats = await paymentColl
                .aggregate(paymentPipeline)
                .toArray();

            const totalPaid = paymentStats[0]?.totalPaid || 0;

            res.send({ totalIssues, byStatus, totalPaid });
        });

        app.get("/stats/staffs", verifyFirebaseToken, async (req, res) => {
            const { email } = req.query;

            const statsPipeline = [
                {
                    $match: {
                        "assignedStaff.email": email,
                    },
                },
                {
                    $group: {
                        _id: "$status",
                        count: { $sum: 1 },
                    },
                },
            ];

            const issueStats = await issueColl
                .aggregate(statsPipeline)
                .toArray();

            const totalAssignedIssues = issueStats.reduce(
                (sum, item) => sum + item.count,
                0,
            );

            const byStatus = {};

            issueStats.forEach((item) => {
                byStatus[item._id] = item.count;
            });

            const today = new Date();
            const startOfDay = new Date(today.setHours(0, 0, 0, 0));
            const endOfDay = new Date(today.setHours(23, 59, 59, 999));

            const todayTasksPipeline = [
                {
                    $match: {
                        // issueStatus: "pending",
                        issueNote: {
                            $regex: "assigned to Staff",
                        },
                        createdAt: {
                            $gte: startOfDay,
                            $lte: endOfDay,
                        },
                    },
                },
                {
                    $addFields: {
                        // Convert string issueId to ObjectId
                        convertedIssueId: {
                            $convert: {
                                input: "$issueId",
                                to: "objectId",
                                onError: null,
                                onNull: null,
                            },
                        },
                    },
                },
                {
                    $lookup: {
                        from: "issues",
                        localField: "convertedIssueId",
                        foreignField: "_id",
                        as: "issue",
                    },
                },
                {
                    $unwind: "$issue",
                },
                {
                    $match: {
                        "issue.assignedStaff.email": email,
                    },
                },
                {
                    $project: {
                        _id: "$convertedIssueId",
                        title: "$issue.title",
                    },
                },
            ];

            const todayTasksResult = await trackingColl
                .aggregate(todayTasksPipeline)
                .toArray();

            // const todayTasks = todayTasksResult.reduce(
            //     (sum) => sum + 1,
            //     0,
            // );
            res.send({ totalAssignedIssues, byStatus, todayTasksResult });
        });

        async function getLatestIssues(limit = 3) {
            const pipeline = [
                {
                    $sort: { createdAt: -1 },
                },
                {
                    $limit: limit,
                },
                {
                    $project: {
                        _id: 1,
                        title: 1,
                    },
                },
            ];

            return await issueColl.aggregate(pipeline).toArray();
        }

        async function getLatestUsers(limit = 3) {
            const pipeline = [
                {
                    $sort: { createdAt: -1 },
                },
                {
                    $limit: limit,
                },
                {
                    $project: {
                        email: 1,
                        displayName: 1,
                        isPremium: 1,
                    },
                },
            ];

            return await userColl.aggregate(pipeline).toArray();
        }

        async function getLatestPayments(limit = 3) {
            const pipeline = [
                {
                    $sort: { createdAt: -1 },
                },
                {
                    $limit: limit,
                },
                {
                    $project: {
                        userEmail: 1,
                        type: 1,
                        amount: 1,
                    },
                },
            ];

            return await paymentColl.aggregate(pipeline).toArray();
        }

        app.get(
            "/stats/admin",
            verifyFirebaseToken,
            verifyAdminToken,
            async (req, res) => {
                // issue stats
                const issuePipeline = [
                    {
                        $group: {
                            _id: "$status",
                            count: { $sum: 1 },
                        },
                    },
                ];

                const issueStats = await issueColl
                    .aggregate(issuePipeline)
                    .toArray();

                const totalIssues = issueStats.reduce(
                    (sum, item) => sum + item.count,
                    0,
                );

                const byStatus = {};

                issueStats.forEach((item) => {
                    byStatus[item._id] = item.count;
                });

                // payment stats
                const paymentPipeline = [
                    {
                        $group: {
                            _id: null,
                            totalReceived: { $sum: { $toDouble: "$amount" } },
                        },
                    },
                ];

                const paymentStats = await paymentColl
                    .aggregate(paymentPipeline)
                    .toArray();

                const totalReceived = paymentStats[0]?.totalReceived || 0;

                const latestIssues = await getLatestIssues();
                const latestUsers = await getLatestUsers();
                const latestPayments = await getLatestPayments();

                res.send({
                    totalIssues,
                    byStatus,
                    totalReceived,
                    latestIssues,
                    latestUsers,
                    latestPayments,
                });
            },
        );

        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log(
        //     "Pinged your deployment. You successfully connected to MongoDB!",
        // );
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
