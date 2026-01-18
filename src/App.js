import React, { useState, useCallback, useMemo } from "react";

export default function App() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);

  const CHUNK_SIZE = 10000; // Increased chunk size for better performance

  const handleFile = useCallback((e) => {
    const f = e.target.files[0];
    if (!f) return;

    setFile(f);
    setFileName(f.name);
    setProgress(0);
    setStatus("File loaded. Ready to sort.");
    setResults([]);
  }, []);

  const sortFile = useCallback(async () => {
    if (!file) {
      alert("Please upload a file first");
      return;
    }

    setProcessing(true);
    setStatus("Processing...");
    setProgress(0);
    
    // Use web workers or chunked processing for large files
    const processFileChunked = async (text) => {
      const lines = text.split("\n");
      const cutoff = new Date("1940-01-01");
      const seenKeys = new Set();
      const output = [];
      const totalChunks = Math.ceil(lines.length / CHUNK_SIZE);

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const chunk = lines.slice(start, start + CHUNK_SIZE);
        
        // Process chunk in microtask
        await new Promise(resolve => {
          queueMicrotask(() => {
            for (const line of chunk) {
              if (!line.trim()) continue;
              
              const cols = line.trim().split("\t");
              if (cols.length < 3) continue;

              // Find DOB efficiently
              let dob = null;
              for (const col of cols) {
                if (/^\d{4}-\d{2}-\d{2}$/.test(col) && !col.includes("-00")) {
                  dob = col;
                  break;
                }
              }
              if (!dob) continue;

              const dobDate = new Date(dob);
              if (dobDate < cutoff) continue;

              // Find SSN efficiently
              let ssn = null;
              for (const col of cols) {
                if (/^\d{3}-\d{2}-\d{4}$/.test(col)) {
                  ssn = col;
                  break;
                }
              }
              if (!ssn) continue;

              const key = `${ssn}|${dob}`;
              if (seenKeys.has(key)) continue;

              // Build name from specific columns
              const nameParts = [];
              if (cols[1]) nameParts.push(cols[1]);
              if (cols[3]) nameParts.push(cols[3]);
              if (cols[2]) nameParts.push(cols[2]);
              
              const name = nameParts.join(" ").trim();
              if (!name) continue;

              seenKeys.add(key);
              output.push({ name, dob, ssn });
            }
            resolve();
          });
        });

        // Update progress less frequently for better performance
        if (chunkIndex % 5 === 0 || chunkIndex === totalChunks - 1) {
          setProgress(Math.round(((chunkIndex + 1) / totalChunks) * 100));
        }
      }

      return output;
    };

    try {
      const text = await file.text();
      const output = await processFileChunked(text);

      // Sort results
      output.sort((a, b) => {
        const nameCompare = a.name.localeCompare(b.name);
        if (nameCompare !== 0) return nameCompare;

        const dateA = new Date(a.dob);
        const dateB = new Date(b.dob);
        if (dateA < dateB) return -1;
        if (dateA > dateB) return 1;

        return a.ssn.localeCompare(b.ssn);
      });

      setResults(output);
      setProgress(100);
      setStatus(`Done ✅ (${output.length} records)`);
    } catch (error) {
      setStatus("Error processing file");
      console.error(error);
    } finally {
      setProcessing(false);
    }
  }, [file]);

  const saveFile = useCallback(() => {
    if (results.length === 0) return;

    const content = results
      .map(r => `${r.name}|${r.dob}|${r.ssn}`)
      .join("\n");

    const base = fileName.replace(/\.txt$/i, "");
    const finalName = `${base}_sorted.txt`;

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  }, [results, fileName]);

  const previewRows = useMemo(() => {
    return results.slice(0, results.length > 1000 ? 1000 : results.length);
  }, [results]);

  const fileSizeMB = useMemo(() => {
    return file ? (file.size / (1024 * 1024)).toFixed(2) : 0;
  }, [file]);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <header style={styles.header}>
          <h1 style={styles.title}>📄 TXT File Sorter</h1>
          <p style={styles.subtitle}>
            Sorts by Name → Date of Birth → SSN
            <br />
            <small>Duplicates are removed based on SSN + DOB combination</small>
          </p>
        </header>

        <div style={styles.uploadSection}>
          <label htmlFor="file-upload" style={styles.uploadLabel}>
            <input
              id="file-upload"
              type="file"
              accept=".txt"
              onChange={handleFile}
              style={styles.fileInput}
              disabled={processing}
            />
            <div style={styles.uploadArea}>
              <svg style={styles.uploadIcon} viewBox="0 0 24 24">
                <path fill="currentColor" d="M14,13V17H10V13H7L12,8L17,13M19.35,10.03C18.67,6.59 15.64,4 12,4C9.11,4 6.6,5.64 5.35,8.03C2.34,8.36 0,10.9 0,14A6,6 0 0,0 6,20H19A5,5 0 0,0 24,15C24,12.36 21.95,10.22 19.35,10.03Z" />
              </svg>
              <p>{file ? `Selected: ${fileName}` : "Choose a .txt file"}</p>
              {file && <p style={styles.fileSize}>{fileSizeMB} MB</p>}
            </div>
          </label>
        </div>

        <div style={styles.controls}>
          <button
            onClick={sortFile}
            disabled={!file || processing}
            style={{
              ...styles.button,
              ...styles.primaryButton,
              ...(processing && styles.disabledButton)
            }}
          >
            {processing ? (
              <>
                <span style={styles.spinner}></span>
                Processing...
              </>
            ) : (
              "🚀 Sort File"
            )}
          </button>

          {results.length > 0 && (
            <button
              onClick={saveFile}
              style={{
                ...styles.button,
                ...styles.successButton
              }}
            >
              💾 Save Sorted File ({results.length} records)
            </button>
          )}
        </div>

        <div style={styles.progressSection}>
          <div style={styles.progressHeader}>
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <div style={styles.progressContainer}>
            <div 
              style={{ 
                ...styles.progressBar,
                width: `${progress}%`,
                opacity: progress === 100 ? 0.8 : 1
              }} 
            />
          </div>
          <p style={styles.status}>{status}</p>
        </div>

        {results.length > 0 && (
          <div style={styles.resultsSection}>
            <div style={styles.resultsHeader}>
              <h3>Preview ({previewRows.length} of {results.length} rows)</h3>
              <div style={styles.stats}>
                <span style={styles.statBadge}>
                  📊 {results.length.toLocaleString()} records
                </span>
                <span style={styles.statBadge}>
                  ⏱️ {new Date().toLocaleTimeString()}
                </span>
              </div>
            </div>
            
            <div style={styles.tableContainer}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>#</th>
                    <th style={styles.th}>Name</th>
                    <th style={styles.th}>Date of Birth</th>
                    <th style={styles.th}>SSN</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i} style={i % 2 === 0 ? styles.evenRow : styles.oddRow}>
                      <td style={styles.td}>{i + 1}</td>
                      <td style={styles.td}>{r.name}</td>
                      <td style={styles.td}>{r.dob}</td>
                      <td style={styles.td}>{r.ssn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {results.length > 1000 && (
              <p style={styles.note}>
                Showing first 1,000 rows. Full file will be saved with all {results.length.toLocaleString()} records.
              </p>
            )}
          </div>
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
    alignItems: "flex-start",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    padding: "20px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  },
  card: {
    background: "#fff",
    padding: "40px",
    width: "100%",
    maxWidth: "1200px",
    borderRadius: "16px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
    textAlign: "center",
    marginTop: "40px"
  },
  header: {
    marginBottom: "32px"
  },
  title: {
    fontSize: "32px",
    fontWeight: "700",
    color: "#333",
    margin: "0 0 8px 0"
  },
  subtitle: {
    fontSize: "14px",
    color: "#666",
    lineHeight: "1.5",
    margin: "0"
  },
  uploadSection: {
    marginBottom: "24px"
  },
  uploadLabel: {
    cursor: "pointer",
    display: "block"
  },
  fileInput: {
    display: "none"
  },
  uploadArea: {
    border: "2px dashed #667eea",
    borderRadius: "12px",
    padding: "40px 20px",
    background: "#f8f9ff",
    transition: "all 0.3s ease",
    ":hover": {
      background: "#f0f2ff",
      borderColor: "#764ba2"
    }
  },
  uploadIcon: {
    width: "64px",
    height: "64px",
    color: "#667eea",
    marginBottom: "16px"
  },
  fileSize: {
    fontSize: "12px",
    color: "#888",
    marginTop: "8px"
  },
  controls: {
    display: "flex",
    gap: "12px",
    justifyContent: "center",
    marginBottom: "32px",
    flexWrap: "wrap"
  },
  button: {
    padding: "14px 28px",
    borderRadius: "8px",
    border: "none",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.2s ease",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px"
  },
  primaryButton: {
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "white",
    ":hover": {
      transform: "translateY(-2px)",
      boxShadow: "0 8px 20px rgba(102, 126, 234, 0.4)"
    }
  },
  successButton: {
    background: "linear-gradient(135deg, #48bb78 0%, #38a169 100%)",
    color: "white",
    ":hover": {
      transform: "translateY(-2px)",
      boxShadow: "0 8px 20px rgba(72, 187, 120, 0.4)"
    }
  },
  disabledButton: {
    opacity: 0.6,
    cursor: "not-allowed",
    ":hover": {
      transform: "none",
      boxShadow: "none"
    }
  },
  spinner: {
    width: "16px",
    height: "16px",
    border: "2px solid rgba(255,255,255,0.3)",
    borderTop: "2px solid white",
    borderRadius: "50%",
    animation: "spin 1s linear infinite"
  },
  progressSection: {
    marginBottom: "32px"
  },
  progressHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
    fontSize: "14px",
    color: "#666"
  },
  progressContainer: {
    height: "10px",
    background: "#e9ecef",
    borderRadius: "5px",
    overflow: "hidden",
    marginBottom: "12px"
  },
  progressBar: {
    height: "100%",
    background: "linear-gradient(90deg, #667eea, #764ba2)",
    transition: "width 0.3s ease",
    borderRadius: "5px"
  },
  status: {
    margin: "0",
    fontSize: "14px",
    color: "#333",
    fontWeight: "500"
  },
  resultsSection: {
    marginTop: "40px",
    textAlign: "left"
  },
  resultsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
    flexWrap: "wrap",
    gap: "12px"
  },
  stats: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap"
  },
  statBadge: {
    background: "#f0f2ff",
    color: "#667eea",
    padding: "6px 12px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: "500"
  },
  tableContainer: {
    maxHeight: "600px",
    overflowY: "auto",
    border: "1px solid #e2e8f0",
    borderRadius: "8px"
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "13px"
  },
  th: {
    background: "#f8f9ff",
    padding: "12px 16px",
    textAlign: "left",
    fontWeight: "600",
    color: "#4a5568",
    borderBottom: "2px solid #e2e8f0",
    position: "sticky",
    top: "0"
  },
  td: {
    padding: "12px 16px",
    borderBottom: "1px solid #e2e8f0"
  },
  evenRow: {
    background: "#fafbff"
  },
  oddRow: {
    background: "#fff"
  },
  note: {
    fontSize: "12px",
    color: "#718096",
    textAlign: "center",
    marginTop: "16px",
    fontStyle: "italic"
  }
};