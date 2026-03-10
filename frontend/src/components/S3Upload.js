import React, { useState } from "react";
import axios from "axios";
import axiosInstance from "../api/axiosInstance";

const S3Upload = () => {
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState("");
    const [downloadUrl, setDownloadUrl] = useState("");

    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
    };

    const handleUpload = async () => {
        if (!file) return alert("Please select a file");

        setUploading(true);
        setMessage("Getting pre-signed URL...");

        try {
            // Task 4: Get Pre-signed URL from Django
            const res = await axiosInstance.post("s3/presign-upload/", {
                filename: file.name,
                content_type: file.type
            });

            const { upload_url, key } = res.data;

            // Task 5: Upload directly from React to S3
            setMessage("Uploading to S3...");
            await axios.put(upload_url, file, {
                headers: {
                    "Content-Type": file.type
                }
            });

            setMessage("Upload successful!");

            // Task 6: Get Download URL
            const downloadRes = await axiosInstance.get(`s3/presign-download/?key=${key}`);
            setDownloadUrl(downloadRes.data.download_url);

        } catch (err) {
            console.error(err);
            setMessage("Upload failed: " + (err.response?.data?.error || err.message));
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="s3-upload-card" style={{ padding: "20px", background: "var(--card-bg)", borderRadius: "12px", marginTop: "20px" }}>
            <h3>S3 Secure File Upload</h3>
            <p style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
                Uses IAM Role based keys. Uploads directly to S3 via pre-signed URL.
            </p>

            <label htmlFor="file-upload" style={{ display: "block", marginBottom: "6px", fontWeight: "500", cursor: "pointer" }}>
                📁 Choose File
            </label>
            <input
                id="file-upload"
                data-testid="file-input"
                type="file"
                onChange={handleFileChange}
                style={{ marginBottom: "10px" }}
            />

            <button
                className="btn-primary"
                onClick={handleUpload}
                disabled={uploading || !file}
            >
                {uploading ? "Processing..." : "Upload to S3"}
            </button>

            {message && <p style={{ marginTop: "10px", fontWeight: "bold" }}>{message}</p>}

            {downloadUrl && (
                <div style={{ marginTop: "10px" }}>
                    <a href={downloadUrl} target="_blank" rel="noreferrer" className="btn-secondary" style={{ textDecoration: "none", display: "inline-block" }}>
                        Download Uploaded File
                    </a>
                </div>
            )}
        </div>
    );
};

export default S3Upload;
