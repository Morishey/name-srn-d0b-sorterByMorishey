import React, { useState } from "react";

export default function App() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [results, setResults] = useState([]);

  const CHUNK_SIZE = 5000;

  function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;

    setFile(f);
    setFileName(f.name);
    setProgress(0);
    setStatus("File loaded. Ready to sort.");
    setResults([]);
  }

  async function sortFile() {
    if (!file) return alert("Upload a file first");

    setStatus("Processing...");
    setProgress(0);

    const text = await file.text();
    const lines = text.split("\n");
    const cutoff = new Date("1940-01-01");

    const seenKeys = new Set();
    const output = [];

    for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
      const chunk = lines.slice(i, i + CHUNK_SIZE);

      for (const line of chunk) {
        const cols = line.trim().split("\t");
        if (cols.length < 3) continue;

        const dob = cols.find(c => /^\d{4}-\d{2}-\d{2}$/.test(c));
        if (!dob || dob.includes("-00")) continue;

        const dobDate = new Date(dob);
        if (dobDate < cutoff) continue;

        const ssn = cols.find(c => /^\d{3}-\d{2}-\d{4}$/.test(c));
        if (!ssn) continue;

        const key = `${ssn}|${dob}`;
        if (seenKeys.has(key)) continue;

        const name = [cols[1], cols[3], cols[2]]
          .filter(Boolean)
          .join(" ")
          .trim();

        if (!name) continue;

        seenKeys.add(key);
        output.push({ name, dob, ssn });
      }

      setProgress(Math.round((i / lines.length) * 100));
      await new Promise(r => setTimeout(r, 0));
    }

    output.sort((a, b) => {
      const n = a.name.localeCompare(b.name);
      if (n !== 0) return n;

      const d = new Date(a.dob) - new Date(b.dob);
      if (d !== 0) return d;

      return a.ssn.localeCompare(b.ssn);
    });

    setResults(output);
    setProgress(100);
    setStatus("Done ✅");
  }

  function saveFile() {
    const content = results
      .map(r => `${r.name}|${r.dob}|${r.ssn}`)
      .join("\n");

    const base = fileName.replace(/\.txt$/i, "");
    const finalName = `${base}_sorted.txt`;

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = finalName;
    a.click();

    URL.revokeObjectURL(url);
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2>TXT Sorter</h2>
        <p>Name → DOB → SSN<br />Duplicates = same SSN + DOB</p>

        <input type="file" accept=".txt" onChange={handleFile} />

        {fileName && <p><b>File:</b> {fileName}</p>}

        <button onClick={sortFile} disabled={!file} style={styles.button}>
          Sort File
        </button>

        <div style={styles.progressBox}>
          <div style={{ ...styles.bar, width: `${progress}%` }} />
        </div>

        <p>{progress}% — {status}</p>

        {results.length > 0 && (
          <>
            <h3>Preview (first 100 rows)</h3>
            <div style={styles.preview}>
              {results.slice(0, 100).map((r, i) => (
                <div key={i}>
                  {r.name} | {r.dob} | {r.ssn}
                </div>
              ))}
            </div>

            <button onClick={saveFile} style={styles.saveButton}>
              Save Sorted File
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "#f4f6f8"
  },
  card: {
    background: "#fff",
    padding: 30,
    width: 520,
    borderRadius: 8,
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    textAlign: "center"
  },
  button: {
    marginTop: 10,
    padding: "8px 16px",
    cursor: "pointer"
  },
  saveButton: {
    marginTop: 15,
    padding: "10px 18px",
    background: "#4caf50",
    color: "#fff",
    border: "none",
    cursor: "pointer"
  },
  progressBox: {
    marginTop: 15,
    height: 18,
    width: "100%",
    border: "1px solid #ccc",
    borderRadius: 4,
    overflow: "hidden"
  },
  bar: {
    height: "100%",
    background: "#4caf50",
    transition: "width 0.2s"
  },
  preview: {
    textAlign: "left",
    maxHeight: 200,
    overflowY: "auto",
    border: "1px solid #ddd",
    padding: 10,
    marginTop: 10,
    fontSize: 13,
    background: "#fafafa"
  }
};
