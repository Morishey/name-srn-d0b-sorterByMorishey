import React, { useState, useCallback, useMemo } from "react";

export default function App() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [includeSeparators, setIncludeSeparators] = useState(true); // New state for toggle

  const CHUNK_SIZE = 10000;

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
    
    const processFileChunked = async (text) => {
      const lines = text.split("\n");
      const cutoff = new Date("1940-01-01");
      const seenKeys = new Set();
      const output = [];
      const totalChunks = Math.ceil(lines.length / CHUNK_SIZE);

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const chunk = lines.slice(start, start + CHUNK_SIZE);
        
        await new Promise(resolve => {
          queueMicrotask(() => {
            for (const line of chunk) {
              if (!line.trim()) continue;
              
              const cols = line.trim().split("\t");
              if (cols.length < 3) continue;

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

        if (chunkIndex % 5 === 0 || chunkIndex === totalChunks - 1) {
          setProgress(Math.round(((chunkIndex + 1) / totalChunks) * 100));
        }
      }

      return output;
    };

    try {
      const text = await file.text();
      const output = await processFileChunked(text);

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

  // Function to extract first and last name from full name
  const extractFirstAndLastName = useCallback((fullName) => {
    const parts = fullName.trim().split(" ");
    const firstName = parts[0] || "";
    const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
    return { firstName, lastName };
  }, []);

  // Function to generate content WITH separators
  const generateContentWithSeparators = useCallback(() => {
    if (results.length === 0) return "";
    
    const contentLines = [];
    let lastFirstName = "";
    let lastLastName = "";
    
    results.forEach((row, index) => {
      const { firstName, lastName } = extractFirstAndLastName(row.name);
      
      // Add separator if either first OR last name changes
      const isFirstNameChange = index > 0 && firstName !== lastFirstName;
      const isLastNameChange = index > 0 && lastName !== lastLastName;
      const shouldAddSeparator = includeSeparators && (isFirstNameChange || isLastNameChange);
      
      if (shouldAddSeparator) {
        const changeTypes = [];
        if (isFirstNameChange) changeTypes.push("first name");
        if (isLastNameChange) changeTypes.push("last name");
        
        const changeType = changeTypes.join(" or ");
        contentLines.push(`==================================== ${changeType} change: ${firstName} ${lastName}`);
      }
      
      // Add the data row
      contentLines.push(`${row.name}|${row.dob}|${row.ssn}`);
      
      lastFirstName = firstName;
      lastLastName = lastName;
    });
    
    return contentLines.join("\n");
  }, [results, extractFirstAndLastName, includeSeparators]);

  // Function to generate content WITHOUT separators (original format)
  const generateContentWithoutSeparators = useCallback(() => {
    return results
      .map(r => `${r.name}|${r.dob}|${r.ssn}`)
      .join("\n");
  }, [results]);

  const saveFile = useCallback(() => {
    if (results.length === 0) return;

    // Use the appropriate content generator based on toggle
    const content = includeSeparators 
      ? generateContentWithSeparators()
      : generateContentWithoutSeparators();

    const base = fileName.replace(/\.txt$/i, "");
    const suffix = includeSeparators ? "_sorted_with_separators" : "_sorted";
    const finalName = `${base}${suffix}.txt`;

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  }, [results, fileName, includeSeparators, generateContentWithSeparators, generateContentWithoutSeparators]);

  // Function to get preview rows with separators
  const getPreviewRowsWithSeparators = useCallback(() => {
    if (results.length === 0) return [];
    
    const previewRows = results.slice(0, results.length > 1000 ? 1000 : results.length);
    const rowsWithSeparators = [];
    let lastFirstName = "";
    let lastLastName = "";
    
    previewRows.forEach((row, index) => {
      const { firstName, lastName } = extractFirstAndLastName(row.name);
      
      const isFirstNameChange = index > 0 && firstName !== lastFirstName;
      const isLastNameChange = index > 0 && lastName !== lastLastName;
      const shouldAddSeparator = includeSeparators && (isFirstNameChange || isLastNameChange);
      
      if (shouldAddSeparator) {
        const changeTypes = [];
        if (isFirstNameChange) changeTypes.push("first name");
        if (isLastNameChange) changeTypes.push("last name");
        
        rowsWithSeparators.push({
          type: 'separator',
          id: `sep-${index}`,
          firstName: firstName,
          lastName: lastName,
          fullName: row.name,
          changeType: changeTypes.join(" or "),
          rowNumber: index
        });
      }
      
      rowsWithSeparators.push({
        type: 'data',
        ...row,
        id: `row-${index}`,
        firstName: firstName,
        lastName: lastName,
        rowNumber: index + 1
      });
      
      lastFirstName = firstName;
      lastLastName = lastName;
    });
    
    return rowsWithSeparators;
  }, [results, extractFirstAndLastName, includeSeparators]);

  const fileSizeMB = useMemo(() => {
    return file ? (file.size / (1024 * 1024)).toFixed(2) : 0;
  }, [file]);

  // Get rows with separators
  const previewRowsWithSeparators = useMemo(() => 
    getPreviewRowsWithSeparators(), 
    [getPreviewRowsWithSeparators]
  );

  // Count unique first names and last names
  const { uniqueFirstNames, uniqueLastNames } = useMemo(() => {
    if (results.length === 0) return { uniqueFirstNames: 0, uniqueLastNames: 0 };
    
    const firstNames = new Set();
    const lastNames = new Set();
    
    results.forEach(result => {
      const { firstName, lastName } = extractFirstAndLastName(result.name);
      if (firstName) firstNames.add(firstName);
      if (lastName) lastNames.add(lastName);
    });
    
    return {
      uniqueFirstNames: firstNames.size,
      uniqueLastNames: lastNames.size
    };
  }, [results, extractFirstAndLastName]);

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
            <div style={styles.saveControls}>
              <div style={styles.separatorToggle}>
                <label style={styles.toggleLabel}>
                  <input
                    type="checkbox"
                    checked={includeSeparators}
                    onChange={(e) => setIncludeSeparators(e.target.checked)}
                    style={styles.toggleInput}
                  />
                  <span style={styles.toggleSlider}></span>
                  <span style={styles.toggleText}>
                    Include separators in output
                  </span>
                </label>
              </div>
              
              <button
                onClick={saveFile}
                style={{
                  ...styles.button,
                  ...styles.successButton
                }}
              >
                💾 Save Sorted File ({results.length} records)
                {includeSeparators && " with separators"}
              </button>
            </div>
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
              <h3>
                Preview ({previewRowsWithSeparators.filter(r => r.type === 'data').length} of {results.length} rows)
                {!includeSeparators && " (separators disabled)"}
              </h3>
              <div style={styles.stats}>
                <span style={styles.statBadge}>
                  👤 {uniqueFirstNames} unique first names
                </span>
                <span style={styles.statBadge}>
                  🏷️ {uniqueLastNames} unique last names
                </span>
                <span style={styles.statBadge}>
                  📊 {results.length} total records
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
                  {previewRowsWithSeparators.map((item) => {
                    if (item.type === 'separator') {
                      return (
                        <tr key={item.id} style={styles.separatorRow}>
                          <td colSpan="4" style={styles.separatorCell}>
                            <div style={styles.separatorContent}>
                              <div style={styles.separatorLine}>
                                ====================================
                              </div>
                              <div style={styles.separatorInfo}>
                                <div style={styles.nameChangeBadge}>
                                  {item.changeType} change
                                </div>
                                <div style={styles.nameDisplay}>
                                  {item.firstName && (
                                    <span style={styles.firstNameBadge}>
                                      {item.firstName}
                                    </span>
                                  )}
                                  {item.lastName && (
                                    <span style={styles.lastNameBadge}>
                                      {item.lastName}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    
                    return (
                      <tr key={item.id} style={item.rowNumber % 2 === 0 ? styles.evenRow : styles.oddRow}>
                        <td style={styles.td}>{item.rowNumber}</td>
                        <td style={styles.td}>
                          <div style={styles.nameCell}>
                            <div style={styles.fullName}>{item.name}</div>
                            <div style={styles.nameParts}>
                              <span style={styles.namePartLabel}>First:</span>
                              <span style={styles.firstNamePart}>{item.firstName}</span>
                              <span style={styles.namePartLabel}>Last:</span>
                              <span style={styles.lastNamePart}>{item.lastName}</span>
                            </div>
                          </div>
                        </td>
                        <td style={styles.td}>{item.dob}</td>
                        <td style={styles.td}>{item.ssn}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            <div style={styles.legend}>
              <div style={styles.legendTitle}>Output Format:</div>
              <div style={styles.legendRules}>
                <div style={styles.legendRule}>
                  <div style={styles.legendLineSample}>= = = = = = =</div>
                  <span>Separator line (added when first OR last name changes)</span>
                </div>
                <div style={styles.legendRule}>
                  <div style={styles.dataSample}>John Doe|1990-01-15|123-45-6789</div>
                  <span>Data line format: Name|DOB|SSN</span>
                </div>
                <div style={styles.legendNote}>
                  {includeSeparators 
                    ? "✓ Separators WILL be included in the saved file" 
                    : "✗ Separators will NOT be included in the saved file"}
                </div>
              </div>
            </div>
            
            {results.length > 1000 && (
              <p style={styles.note}>
                Showing first 1,000 rows. Full file will be saved with all {results.length.toLocaleString()} records.
                {includeSeparators && " Includes separators between name groups."}
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
    flexDirection: "column",
    gap: "16px",
    justifyContent: "center",
    marginBottom: "32px",
    alignItems: "center"
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
  saveControls: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    width: "100%"
  },
  separatorToggle: {
    marginBottom: "8px"
  },
  toggleLabel: {
    display: "flex",
    alignItems: "center",
    cursor: "pointer",
    gap: "10px"
  },
  toggleInput: {
    display: "none"
  },
  toggleSlider: {
    width: "50px",
    height: "26px",
    backgroundColor: "#e2e8f0",
    borderRadius: "34px",
    position: "relative",
    transition: "background-color 0.2s"
  },
  toggleText: {
    fontSize: "14px",
    color: "#4a5568",
    fontWeight: "500"
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
    borderRadius: "8px",
    position: "relative"
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
    top: "0",
    zIndex: "10"
  },
  td: {
    padding: "12px 16px",
    borderBottom: "1px solid #e2e8f0",
    verticalAlign: "middle"
  },
  // Separator styles
  separatorRow: {
    background: "linear-gradient(90deg, #fff5f5, #fff 50%, #fff5f5)"
  },
  separatorCell: {
    padding: "12px 16px",
    borderBottom: "3px solid #e53e3e",
    borderTop: "3px solid #e53e3e"
  },
  separatorContent: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    gap: "8px"
  },
  separatorLine: {
    color: "#e53e3e",
    fontFamily: "monospace",
    fontSize: "14px",
    letterSpacing: "2px",
    fontWeight: "bold",
    opacity: "0.8"
  },
  separatorInfo: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
    justifyContent: "center"
  },
  nameChangeBadge: {
    background: "#e53e3e",
    color: "white",
    padding: "4px 12px",
    borderRadius: "16px",
    fontSize: "12px",
    fontWeight: "600",
    whiteSpace: "nowrap"
  },
  nameDisplay: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap"
  },
  firstNameBadge: {
    background: "#4299e1",
    color: "white",
    padding: "4px 10px",
    borderRadius: "4px",
    fontSize: "12px",
    fontWeight: "500"
  },
  lastNameBadge: {
    background: "#38a169",
    color: "white",
    padding: "4px 10px",
    borderRadius: "4px",
    fontSize: "12px",
    fontWeight: "500"
  },
  // Regular row styles
  evenRow: {
    background: "#fafbff"
  },
  oddRow: {
    background: "#fff"
  },
  nameCell: {
    display: "flex",
    flexDirection: "column",
    gap: "6px"
  },
  fullName: {
    fontWeight: "500",
    color: "#2d3748",
    fontSize: "14px"
  },
  nameParts: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "11px",
    flexWrap: "wrap"
  },
  namePartLabel: {
    color: "#718096",
    fontSize: "10px",
    textTransform: "uppercase",
    letterSpacing: "0.5px"
  },
  firstNamePart: {
    color: "#2b6cb0",
    backgroundColor: "#bee3f8",
    padding: "2px 6px",
    borderRadius: "3px",
    fontWeight: "500"
  },
  lastNamePart: {
    color: "#276749",
    backgroundColor: "#c6f6d5",
    padding: "2px 6px",
    borderRadius: "3px",
    fontWeight: "500"
  },
  // Legend
  legend: {
    marginTop: "20px",
    padding: "16px",
    backgroundColor: "#f8f9ff",
    borderRadius: "8px",
    border: "1px solid #e2e8f0"
  },
  legendTitle: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#4a5568",
    marginBottom: "12px",
    textAlign: "center"
  },
  legendRules: {
    display: "flex",
    flexDirection: "column",
    gap: "10px"
  },
  legendRule: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    fontSize: "12px",
    color: "#718096"
  },
  legendLineSample: {
    color: "#e53e3e",
    fontFamily: "monospace",
    fontSize: "12px",
    fontWeight: "bold",
    minWidth: "120px"
  },
  dataSample: {
    color: "#4a5568",
    fontFamily: "monospace",
    fontSize: "12px",
    backgroundColor: "#edf2f7",
    padding: "4px 8px",
    borderRadius: "4px",
    minWidth: "250px"
  },
  legendNote: {
    marginTop: "8px",
    padding: "8px",
    backgroundColor: "#feebc8",
    color: "#744210",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: "500",
    textAlign: "center"
  },
  note: {
    fontSize: "12px",
    color: "#718096",
    textAlign: "center",
    marginTop: "16px",
    fontStyle: "italic"
  }
};

// Add CSS for toggle
const toggleStyle = document.createElement('style');
toggleStyle.textContent = `
  input:checked + span {
    background-color: #48bb78;
  }
  
  input:checked + span:before {
    transform: translateX(24px);
  }
  
  span:before {
    content: '';
    position: absolute;
    height: 22px;
    width: 22px;
    left: 2px;
    bottom: 2px;
    background-color: white;
    border-radius: 50%;
    transition: transform 0.2s;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(toggleStyle);