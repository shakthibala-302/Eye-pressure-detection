import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Storage } from "@google-cloud/storage";
import multer from "multer";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Setup Multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Setup GCS
const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID
});
const bucketName = process.env.GCS_BUCKET || "";

async function startServer() {
  // API Routes
  app.use(express.json({ limit: '20mb' }));

  app.post("/api/upload", upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image uploaded" });
      }

      if (!bucketName) {
        return res.status(400).json({ error: "GCS_BUCKET is not configured in environment variables." });
      }

      const bucket = storage.bucket(bucketName);
      const blob = bucket.file(`analysis/${Date.now()}-${req.file.originalname}`);
      const blobStream = blob.createWriteStream({
        resumable: false,
        metadata: {
          contentType: req.file.mimetype,
        },
      });

      blobStream.on("error", (err) => {
        console.error("GCS Upload Error:", err);
        res.status(500).json({ error: "GCS Upload Failed" });
      });

      blobStream.on("finish", async () => {
        try {
          const [url] = await blob.getSignedUrl({
            version: "v4",
            action: "read",
            expires: Date.now() + 15 * 60 * 1000, // 15 minutes
          });
          res.json({ url });
        } catch (signedError) {
          res.status(500).json({ error: "Failed to generate signed URL" });
        }
      });

      blobStream.end(req.file.buffer);
    } catch (error) {
      res.status(500).json({ error: "Server error during upload" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
