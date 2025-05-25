import React, { useRef, useState } from "react";
import axios from "axios";

const VideoUploader = () => {
  const fileInputRef = useRef(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    const file = fileInputRef.current.files[0];
    if (!file) return alert("No file selected");

    const chunkSize = 1024 * 256; // 256 KB
    setUploading(true);

    try {
      // Step 1: Send POST to get upload URL
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

      const uploadUrl = postResponse.headers.location;
      if (!uploadUrl) {
        alert("Upload URL not returned from server");
        setUploading(false);
        return;
      }

      let offset = 0;

      // Step 2: Upload file in chunks
      while (offset < file.size) {
        const end = Math.min(offset + chunkSize, file.size);
        const chunk = await file.slice(offset, end).arrayBuffer();

        const patchResponse = await fetch(
          `http://localhost:8082/upload/${uploadUrl}`,
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

        if (!patchResponse.ok) {
          throw new Error(`Upload failed at offset ${offset}`);
        }
        console.log("patch response",  patchResponse )
        const newOffset = parseInt(
          patchResponse.headers.get("Upload-Offset") || offset
        );
       
        offset = newOffset;

        // Update progress state
        setUploadProgress(Math.round((offset / file.size) * 100));
      }

      alert("Upload complete");
    } catch (error) {
      console.error("Upload error:", error);
      alert("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h2>Upload Video via TUS</h2>
      <input type="file" ref={fileInputRef} accept="video/*" disabled={uploading} />
      <br /><br />
      <button onClick={handleUpload} disabled={uploading}>
        {uploading ? "Uploading..." : "Upload"}
      </button>
      {uploading && (
        <div style={{ marginTop: "10px" }}>
          <progress value={uploadProgress} max="100" style={{ width: "100%" }} />
          <p>{uploadProgress}%</p>
        </div>
      )}
    </div>
  );
};

export default VideoUploader;
