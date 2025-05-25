import React, { useRef, useState } from "react";
import axios from "axios";

const MIN_CHUNK_SIZE = 64 * 1024;      // 64 KB
const MAX_CHUNK_SIZE = 1024 * 1024;    // 1 MB
const INITIAL_CHUNK_SIZE = 256 * 1024; // 256 KB
const MAX_RETRIES = 3;

const VideoUploader = () => {
  const fileInputRef = useRef(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [resumeFlag, setResumeFlag] = useState(false);

  const fileRef = useRef(null);
  const offsetRef = useRef(0);
  const uploadUrlRef = useRef("");
  const chunkSizeRef = useRef(INITIAL_CHUNK_SIZE);

  const uploadChunk = async (file, offset, retries = 0) => {
    const chunkSize = chunkSizeRef.current;
    const end = Math.min(offset + chunkSize, file.size);
    const chunk = await file.slice(offset, end).arrayBuffer();

    const startTime = performance.now(); // Start timing

    try {
      const patchResponse = await fetch(
        `http://localhost:8082/upload/${uploadUrlRef.current}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/offset+octet-stream",
            "Upload-Offset": offset.toString(),
            "Content-Length": chunk.byteLength.toString(),
            "Tus-Resumable": "1.0.0"
          },
          body: chunk
        }
      );

      const duration = performance.now() - startTime; // Upload time in ms

      if (!patchResponse.ok) {
        throw new Error(`Upload failed at offset ${offset}`);
      }

      // 🔁 Adaptive chunk size adjustment
      if (duration < 300 && chunkSize < MAX_CHUNK_SIZE) {
        chunkSizeRef.current = Math.min(chunkSize * 2, MAX_CHUNK_SIZE); // Speed good → increase chunk size
      } else if (duration > 800 && chunkSize > MIN_CHUNK_SIZE) {
        chunkSizeRef.current = Math.max(chunkSize / 2, MIN_CHUNK_SIZE); // Speed bad → decrease chunk size
      }

      const newOffset = parseInt(
        patchResponse.headers.get("Upload-Offset") || offset
      );
      offsetRef.current = newOffset;
      setUploadProgress(Math.round((newOffset / file.size) * 100));
      return true;
    } catch (error) {
      if (retries < MAX_RETRIES) {
        console.warn(`Retrying chunk at offset ${offset}, attempt ${retries + 1}`);
        return uploadChunk(file, offset, retries + 1);
      } else {
        throw error;
      }
    }
  };

  const handleUpload = async () => {
    const file = fileInputRef.current.files[0];
    if (!file) return alert("No file selected");

    fileRef.current = file;
    offsetRef.current = 0;
    chunkSizeRef.current = INITIAL_CHUNK_SIZE;
    setUploading(true);
    setPaused(false);

    try {
      // 1. Get Upload URL from server
      const metaRequest = {
        name: file.name,
        description: "My video upload",
        distributor: "React App",
        timeline: new Date().toISOString()
      };

      const postResponse = await axios.post(
        "http://localhost:8082/upload",
        metaRequest,
        {
          headers: {
            "Upload-Length": file.size,
            "Content-Type": "application/json",
            "Tus-Resumable": "1.0.0"
          }
        }
      );

      uploadUrlRef.current = postResponse.headers.location;
      if (!uploadUrlRef.current) throw new Error("No upload URL received");

      // 2. Start uploading chunks
      await uploadChunks();
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const uploadChunks = async () => {
    const file = fileRef.current;

    while (offsetRef.current < file.size) {
      if (paused) {
        setResumeFlag(true);
        return;
      }

      try {
        await uploadChunk(file, offsetRef.current);
      } catch (err) {
        console.error("Chunk upload failed after retries:", err);
        alert("Upload failed on a chunk after multiple retries");
        setUploading(false);
        return;
      }
    }

    alert("Upload complete");
    setUploading(false);
  };

  const handlePauseResume = () => {
    if (paused) {
      setPaused(false);
      setResumeFlag(false);
      uploadChunks(); // Resume upload
    } else {
      setPaused(true);
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h2>Upload Video via TUS (with Adaptive Chunking)</h2>
      <input type="file" ref={fileInputRef} accept="video/*" disabled={uploading} />
      <br /><br />
      <button onClick={handleUpload} disabled={uploading}>
        {uploading ? "Uploading..." : "Start Upload"}
      </button>
      {uploading && (
        <>
          <button onClick={handlePauseResume} style={{ marginLeft: "10px" }}>
            {paused ? "Resume" : "Pause"}
          </button>
          <div style={{ marginTop: "10px" }}>
            <progress value={uploadProgress} max="100" style={{ width: "100%" }} />
            <p>{uploadProgress}%</p>
            <p>Current Chunk Size: {(chunkSizeRef.current / 1024).toFixed(0)} KB</p>
          </div>
        </>
      )}
    </div>
  );
};

export default VideoUploader;
