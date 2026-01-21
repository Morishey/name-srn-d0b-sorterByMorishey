import React, { useState, useCallback, useMemo } from "react";

export default function App() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [includeSeparators, setIncludeSeparators] = useState(true);

  const CHUNK_SIZE = 10000;

  const extractFirstAndLastName = useCallback((fullName) => {
    const parts = fullName.trim().split(" ");
    const firstName = parts[0] || "";
    const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
    return { firstName, lastName };
  }, []);

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

              const { firstName, lastName } = extractFirstAndLastName(name);
              
              seenKeys.add(key);
              output.push({ 
                name, 
                dob, 
                ssn,
                firstName,
                lastName
              });
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
        const firstNameCompare = a.firstName.localeCompare(b.firstName);
        if (firstNameCompare !== 0) return firstNameCompare;
        
        const lastNameCompare = a.lastName.localeCompare(b.lastName);
        if (lastNameCompare !== 0) return lastNameCompare;
        
        const dateA = new Date(a.dob);
        const dateB = new Date(b.dob);
        if (dateA < dateB) return -1;
        if (dateA > dateB) return 1;

        return a.ssn.localeCompare(b.ssn);
      });

      setResults(output);
      setProgress(100);
      setStatus(`✅ Processing complete - ${output.length.toLocaleString()} records sorted`);
    } catch (error) {
      setStatus("❌ Error processing file");
      console.error(error);
    } finally {
      setProcessing(false);
    }
  }, [file, extractFirstAndLastName]);

  const generateContentWithSeparators = useCallback(() => {
    if (results.length === 0) return "";
    
    const contentLines = [];
    let lastFullName = "";
    
    results.forEach((row, index) => {
      const { firstName, lastName } = extractFirstAndLastName(row.name);
      const currentFullName = `${firstName} ${lastName}`;
      
      const shouldAddSeparator = includeSeparators && index > 0 && currentFullName !== lastFullName;
      
      if (shouldAddSeparator) {
        contentLines.push(`==================================== ${currentFullName}`);
      }
      
      contentLines.push(`${row.name}|${row.dob}|${row.ssn}`);
      
      lastFullName = currentFullName;
    });
    
    return contentLines.join("\n");
  }, [results, extractFirstAndLastName, includeSeparators]);

  const generateContentWithoutSeparators = useCallback(() => {
    return results
      .map(r => `${r.name}|${r.dob}|${r.ssn}`)
      .join("\n");
  }, [results]);

  const saveFile = useCallback(() => {
    if (results.length === 0) return;

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

  const getPreviewRowsWithSeparators = useCallback(() => {
    if (results.length === 0) return [];
    
    const previewRows = results.slice(0, results.length > 1000 ? 1000 : results.length);
    const rowsWithSeparators = [];
    let lastFullName = "";
    
    previewRows.forEach((row, index) => {
      const { firstName, lastName } = extractFirstAndLastName(row.name);
      const currentFullName = `${firstName} ${lastName}`;
      
      const shouldAddSeparator = includeSeparators && index > 0 && currentFullName !== lastFullName;
      
      if (shouldAddSeparator) {
        rowsWithSeparators.push({
          type: 'separator',
          id: `sep-${index}`,
          firstName: firstName,
          lastName: lastName,
          fullName: row.name,
          groupName: currentFullName,
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
      
      lastFullName = currentFullName;
    });
    
    return rowsWithSeparators;
  }, [results, extractFirstAndLastName, includeSeparators]);

  const fileSizeMB = useMemo(() => {
    return file ? (file.size / (1024 * 1024)).toFixed(2) : 0;
  }, [file]);

  const previewRowsWithSeparators = useMemo(() => 
    getPreviewRowsWithSeparators(), 
    [getPreviewRowsWithSeparators]
  );

  const uniqueNameGroups = useMemo(() => {
    if (results.length === 0) return 0;
    
    const groups = new Set();
    results.forEach(result => {
      const { firstName, lastName } = extractFirstAndLastName(result.name);
      groups.add(`${firstName} ${lastName}`);
    });
    
    return groups.size;
  }, [results, extractFirstAndLastName]);

  const recordsPerGroup = useMemo(() => {
    if (results.length === 0) return [];
    
    const groups = {};
    results.forEach(result => {
      const { firstName, lastName } = extractFirstAndLastName(result.name);
      const key = `${firstName} ${lastName}`;
      groups[key] = (groups[key] || 0) + 1;
    });
    
    return Object.entries(groups)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [results, extractFirstAndLastName]);

  return (
    <div style={styles.page}>
      {/* Animated background elements */}
      <div style={styles.backgroundElements}>
        <div style={styles.bgCircle1}></div>
        <div style={styles.bgCircle2}></div>
        <div style={styles.bgCircle3}></div>
      </div>
      
      <div style={styles.card}>
        {/* Header with logo */}
        <header style={styles.header}>
          <div style={styles.logo}>
            <div style={styles.logoIcon}>📊</div>
            <div style={styles.logoText}>
              <h1 style={styles.title}>Mosort Pro</h1>
              <p style={styles.subtitle}>Intelligent Text File Processor</p>
            </div>
          </div>
          <div style={styles.headerStats}>
            <div style={styles.statCard}>
              <div style={styles.statIcon}>⚡</div>
              <div style={styles.statContent}>
                <div style={styles.statValue}>Fast</div>
                <div style={styles.statLabel}>Processing</div>
              </div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statIcon}>🔒</div>
              <div style={styles.statContent}>
                <div style={styles.statValue}>Secure</div>
                <div style={styles.statLabel}>Data Handling</div>
              </div>
            </div>
          </div>
        </header>

        {/* Main content */}
        <div style={styles.mainContent}>
          {/* Left panel - Upload & Controls */}
          <div style={styles.leftPanel}>
            <div style={styles.uploadCard}>
              <div style={styles.uploadHeader}>
                <h3 style={styles.cardTitle}>File Upload</h3>
                <div style={styles.fileTypeBadge}>TXT</div>
              </div>
              
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
                  <div style={styles.uploadIconContainer}>
                    <div style={styles.uploadIcon}>📁</div>
                    <div style={styles.uploadIconGlow}></div>
                  </div>
                  <p style={styles.uploadText}>
                    {file ? fileName : "Drag & drop or click to browse"}
                  </p>
                  {file && (
                    <div style={styles.fileInfo}>
                      <div style={styles.fileInfoRow}>
                        <span style={styles.fileInfoLabel}>Size:</span>
                        <span style={styles.fileInfoValue}>{fileSizeMB} MB</span>
                      </div>
                      <div style={styles.fileInfoRow}>
                        <span style={styles.fileInfoLabel}>Type:</span>
                        <span style={styles.fileInfoValue}>Text File</span>
                      </div>
                    </div>
                  )}
                  <div style={styles.uploadHint}>
                    Supports .txt files with tab-separated values
                  </div>
                </div>
              </label>
            </div>

            <div style={styles.controlsCard}>
              <div style={styles.controlsHeader}>
                <h3 style={styles.cardTitle}>Processing Controls</h3>
                <div style={styles.statusIndicator}>
                  <div style={{
                    ...styles.statusDot,
                    backgroundColor: processing ? '#ff6b6b' : '#48bb78'
                  }}></div>
                  <span style={styles.statusText}>
                    {processing ? 'Processing' : 'Ready'}
                  </span>
                </div>
              </div>

              <button
                onClick={sortFile}
                disabled={!file || processing}
                style={{
                  ...styles.button,
                  ...styles.primaryButton,
                  ...(processing && styles.disabledButton)
                }}
              >
                <div style={styles.buttonContent}>
                  {processing ? (
                    <>
                      <div style={styles.spinnerContainer}>
                        <div style={styles.spinner}></div>
                      </div>
                      <span>Processing Data...</span>
                    </>
                  ) : (
                    <>
                      <div style={styles.buttonIcon}>🚀</div>
                      <span>Start Processing</span>
                    </>
                  )}
                </div>
              </button>

              {/* Progress Section */}
              <div style={styles.progressCard}>
                <div style={styles.progressHeader}>
                  <span style={styles.progressLabel}>Processing Progress</span>
                  <span style={styles.progressPercent}>{progress}%</span>
                </div>
                <div style={styles.progressContainer}>
                  <div 
                    style={{ 
                      ...styles.progressBar,
                      width: `${progress}%`,
                      background: `linear-gradient(90deg, #667eea, #9f7aea, #667eea)`,
                      backgroundSize: '200% 100%',
                      animation: progress === 100 ? 'none' : 'shimmer 2s infinite linear'
                    }} 
                  />
                </div>
                <p style={styles.statusMessage}>{status}</p>
              </div>

              {/* Settings */}
              <div style={styles.settingsCard}>
                <div style={styles.settingsHeader}>
                  <h4 style={styles.settingsTitle}>Output Settings</h4>
                  <div style={styles.settingsIcon}>⚙️</div>
                </div>
                
                <div style={styles.settingItem}>
                  <label style={styles.settingLabel}>
                    <div style={styles.settingInfo}>
                      <span style={styles.settingName}>Group Separators</span>
                      <span style={styles.settingDescription}>
                        Add visual separators between name groups
                      </span>
                    </div>
                    <div style={styles.switchContainer}>
                      <input
                        type="checkbox"
                        checked={includeSeparators}
                        onChange={(e) => setIncludeSeparators(e.target.checked)}
                        style={styles.switchInput}
                      />
                      <span style={styles.switchSlider}></span>
                    </div>
                  </label>
                </div>
              </div>

              {results.length > 0 && (
                <button
                  onClick={saveFile}
                  style={{
                    ...styles.button,
                    ...styles.successButton
                  }}
                >
                  <div style={styles.buttonContent}>
                    <div style={styles.buttonIcon}>💾</div>
                    <div style={styles.saveButtonText}>
                      <div style={styles.saveButtonMain}>
                        Download Sorted File
                      </div>
                      <div style={styles.saveButtonSub}>
                        {results.length.toLocaleString()} records • {includeSeparators ? 'With separators' : 'Without separators'}
                      </div>
                    </div>
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* Right panel - Preview & Results */}
          <div style={styles.rightPanel}>
            <div style={styles.resultsCard}>
              <div style={styles.resultsHeader}>
                <div style={styles.resultsTitle}>
                  <h3 style={styles.cardTitle}>Results Preview</h3>
                  <div style={styles.resultsStats}>
                    <div style={styles.resultsStat}>
                      <div style={styles.resultsStatValue}>{uniqueNameGroups}</div>
                      <div style={styles.resultsStatLabel}>Name Groups</div>
                    </div>
                    <div style={styles.resultsStat}>
                      <div style={styles.resultsStatValue}>{results.length}</div>
                      <div style={styles.resultsStatLabel}>Total Records</div>
                    </div>
                  </div>
                </div>
                
                {recordsPerGroup.length > 0 && (
                  <div style={styles.topGroups}>
                    <div style={styles.topGroupsTitle}>Top Groups</div>
                    <div style={styles.topGroupsList}>
                      {recordsPerGroup.slice(0, 3).map((group, index) => (
                        <div key={index} style={styles.topGroupItem}>
                          <div style={styles.topGroupRank}>{index + 1}</div>
                          <div style={styles.topGroupContent}>
                            <div style={styles.topGroupName}>{group.name}</div>
                            <div style={styles.topGroupCount}>{group.count} records</div>
                          </div>
                          <div style={styles.topGroupBar}>
                            <div 
                              style={{
                                ...styles.topGroupBarFill,
                                width: `${(group.count / recordsPerGroup[0].count) * 100}%`
                              }}
                            ></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {results.length > 0 && (
                <>
                  <div style={styles.tableContainer}>
                    <div style={styles.tableHeader}>
                      <div style={styles.tableHeaderCell}>#</div>
                      <div style={styles.tableHeaderCell}>Name</div>
                      <div style={styles.tableHeaderCell}>Date of Birth</div>
                      <div style={styles.tableHeaderCell}>SSN</div>
                    </div>
                    
                    <div style={styles.tableBody}>
                      {previewRowsWithSeparators.map((item) => {
                        if (item.type === 'separator') {
                          return (
                            <div key={item.id} style={styles.separatorRow}>
                              <div style={styles.separatorContent}>
                                <div style={styles.separatorLine}>
                                  <div style={styles.separatorDashes}>
                                    {Array(20).fill('—').join('')}
                                  </div>
                                  <div style={styles.separatorLabel}>
                                    <div style={styles.separatorGroup}>
                                      {item.groupName}
                                    </div>
                                    <div style={styles.separatorCount}>
                                      {results.filter(r => {
                                        const { firstName, lastName } = extractFirstAndLastName(r.name);
                                        return `${firstName} ${lastName}` === item.groupName;
                                      }).length} records
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        
                        return (
                          <div key={item.id} style={styles.dataRow}>
                            <div style={styles.dataCell}>{item.rowNumber}</div>
                            <div style={styles.dataCell}>
                              <div style={styles.nameCell}>
                                <div style={styles.namePrimary}>{item.name}</div>
                                <div style={styles.nameDetails}>
                                  <span style={styles.nameDetail}>
                                    <span style={styles.nameDetailLabel}>First:</span>
                                    <span style={styles.nameDetailValue}>{item.firstName}</span>
                                  </span>
                                  <span style={styles.nameDetail}>
                                    <span style={styles.nameDetailLabel}>Last:</span>
                                    <span style={styles.nameDetailValue}>{item.lastName}</span>
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div style={styles.dataCell}>
                              <div style={styles.dobCell}>
                                {item.dob}
                              </div>
                            </div>
                            <div style={styles.dataCell}>
                              <div style={styles.ssnCell}>
                                {item.ssn}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {results.length > 1000 && (
                    <div style={styles.previewNote}>
                      <div style={styles.previewNoteIcon}>ℹ️</div>
                      <div style={styles.previewNoteText}>
                        Showing first 1,000 of {results.length.toLocaleString()} records
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer style={styles.footer}>
          <div style={styles.footerContent}>
            <div style={styles.footerText}>
              DataSort Pro v1.0 • Secure file processing
            </div>
            <div style={styles.footerStats}>
              {processing && (
                <div style={styles.processingStats}>
                  <span style={styles.processingText}>
                    Processing: {progress}%
                  </span>
                </div>
              )}
            </div>
          </div>
        </footer>
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
    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    padding: "20px",
    position: "relative",
    overflow: "hidden"
  },
  
  backgroundElements: {
    position: "absolute",
    width: "100%",
    height: "100%",
    top: 0,
    left: 0,
    zIndex: 0
  },
  
  bgCircle1: {
    position: "absolute",
    width: "600px",
    height: "600px",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(102, 126, 234, 0.1) 0%, rgba(102, 126, 234, 0) 70%)",
    top: "-200px",
    right: "-200px",
    filter: "blur(40px)"
  },
  
  bgCircle2: {
    position: "absolute",
    width: "500px",
    height: "500px",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(159, 122, 234, 0.08) 0%, rgba(159, 122, 234, 0) 70%)",
    bottom: "-150px",
    left: "-150px",
    filter: "blur(40px)"
  },
  
  bgCircle3: {
    position: "absolute",
    width: "300px",
    height: "300px",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(56, 189, 248, 0.05) 0%, rgba(56, 189, 248, 0) 70%)",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    filter: "blur(30px)"
  },
  
  card: {
    background: "rgba(30, 41, 59, 0.8)",
    backdropFilter: "blur(20px)",
    borderRadius: "24px",
    padding: "32px",
    width: "100%",
    maxWidth: "1600px",
    boxShadow: `
      0 20px 80px rgba(0, 0, 0, 0.4),
      0 8px 32px rgba(0, 0, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.1)
    `,
    border: "1px solid rgba(255, 255, 255, 0.1)",
    zIndex: 1,
    position: "relative"
  },
  
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "40px",
    paddingBottom: "24px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.1)"
  },
  
  logo: {
    display: "flex",
    alignItems: "center",
    gap: "16px"
  },
  
  logoIcon: {
    fontSize: "48px",
    background: "linear-gradient(135deg, #667eea, #9f7aea)",
    borderRadius: "16px",
    width: "64px",
    height: "64px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 8px 32px rgba(102, 126, 234, 0.3)"
  },
  
  logoText: {
    display: "flex",
    flexDirection: "column"
  },
  
  title: {
    fontSize: "32px",
    fontWeight: "800",
    background: "linear-gradient(135deg, #ffffff, #cbd5e1)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    margin: "0 0 4px 0",
    letterSpacing: "-0.5px"
  },
  
  subtitle: {
    fontSize: "14px",
    color: "#94a3b8",
    margin: 0,
    fontWeight: "500"
  },
  
  headerStats: {
    display: "flex",
    gap: "16px"
  },
  
  statCard: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    background: "rgba(30, 41, 59, 0.6)",
    padding: "12px 20px",
    borderRadius: "12px",
    border: "1px solid rgba(255, 255, 255, 0.05)"
  },
  
  statIcon: {
    fontSize: "20px"
  },
  
  statContent: {
    display: "flex",
    flexDirection: "column"
  },
  
  statValue: {
    fontSize: "14px",
    fontWeight: "700",
    color: "#ffffff"
  },
  
  statLabel: {
    fontSize: "12px",
    color: "#94a3b8"
  },
  
  mainContent: {
    display: "grid",
    gridTemplateColumns: "1fr 2fr",
    gap: "32px",
    marginBottom: "32px"
  },
  
  leftPanel: {
    display: "flex",
    flexDirection: "column",
    gap: "24px"
  },
  
  rightPanel: {
    display: "flex",
    flexDirection: "column"
  },
  
  uploadCard: {
    background: "rgba(30, 41, 59, 0.6)",
    borderRadius: "20px",
    padding: "24px",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)"
  },
  
  uploadHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px"
  },
  
  cardTitle: {
    fontSize: "18px",
    fontWeight: "700",
    color: "#ffffff",
    margin: 0
  },
  
  fileTypeBadge: {
    background: "rgba(102, 126, 234, 0.2)",
    color: "#667eea",
    padding: "4px 12px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: "600",
    border: "1px solid rgba(102, 126, 234, 0.3)"
  },
  
  uploadLabel: {
    cursor: "pointer",
    display: "block"
  },
  
  fileInput: {
    display: "none"
  },
  
  uploadArea: {
    border: "2px dashed rgba(102, 126, 234, 0.3)",
    borderRadius: "16px",
    padding: "40px 24px",
    background: "rgba(15, 23, 42, 0.4)",
    transition: "all 0.3s ease",
    textAlign: "center",
    ":hover": {
      borderColor: "#667eea",
      background: "rgba(15, 23, 42, 0.6)"
    }
  },
  
  uploadIconContainer: {
    position: "relative",
    marginBottom: "16px"
  },
  
  uploadIcon: {
    fontSize: "48px",
    color: "#667eea",
    position: "relative",
    zIndex: 1
  },
  
  uploadIconGlow: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "60px",
    height: "60px",
    background: "radial-gradient(circle, rgba(102, 126, 234, 0.3) 0%, rgba(102, 126, 234, 0) 70%)",
    borderRadius: "50%",
    filter: "blur(8px)"
  },
  
  uploadText: {
    fontSize: "16px",
    color: "#e2e8f0",
    margin: "0 0 16px 0",
    fontWeight: "500"
  },
  
  fileInfo: {
    background: "rgba(30, 41, 59, 0.6)",
    borderRadius: "12px",
    padding: "12px",
    marginBottom: "16px"
  },
  
  fileInfoRow: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "8px",
    ":last-child": {
      marginBottom: 0
    }
  },
  
  fileInfoLabel: {
    fontSize: "13px",
    color: "#94a3b8"
  },
  
  fileInfoValue: {
    fontSize: "13px",
    color: "#ffffff",
    fontWeight: "500"
  },
  
  uploadHint: {
    fontSize: "12px",
    color: "#64748b",
    fontStyle: "italic"
  },
  
  controlsCard: {
    display: "flex",
    flexDirection: "column",
    gap: "20px"
  },
  
  controlsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px"
  },
  
  statusIndicator: {
    display: "flex",
    alignItems: "center",
    gap: "8px"
  },
  
  statusDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    animation: "pulse 2s infinite"
  },
  
  statusText: {
    fontSize: "13px",
    color: "#94a3b8"
  },
  
  button: {
    padding: "18px 24px",
    borderRadius: "14px",
    border: "none",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.3s ease",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    width: "100%"
  },
  
  buttonContent: {
    display: "flex",
    alignItems: "center",
    gap: "12px"
  },
  
  primaryButton: {
    background: "linear-gradient(135deg, #667eea 0%, #9f7aea 100%)",
    color: "white",
    boxShadow: "0 8px 32px rgba(102, 126, 234, 0.4)",
    ":hover": {
      transform: "translateY(-2px)",
      boxShadow: "0 12px 40px rgba(102, 126, 234, 0.5)"
    }
  },
  
  successButton: {
    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    color: "white",
    boxShadow: "0 8px 32px rgba(16, 185, 129, 0.4)",
    ":hover": {
      transform: "translateY(-2px)",
      boxShadow: "0 12px 40px rgba(16, 185, 129, 0.5)"
    }
  },
  
  disabledButton: {
    opacity: 0.6,
    cursor: "not-allowed",
    ":hover": {
      transform: "none",
      boxShadow: "0 8px 32px rgba(102, 126, 234, 0.4)"
    }
  },
  
  buttonIcon: {
    fontSize: "20px"
  },
  
  spinnerContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  
  spinner: {
    width: "20px",
    height: "20px",
    border: "2px solid rgba(255,255,255,0.3)",
    borderTop: "2px solid white",
    borderRadius: "50%",
    animation: "spin 1s linear infinite"
  },
  
  saveButtonText: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start"
  },
  
  saveButtonMain: {
    fontSize: "16px",
    fontWeight: "600"
  },
  
  saveButtonSub: {
    fontSize: "12px",
    opacity: 0.9,
    fontWeight: "400"
  },
  
  progressCard: {
    background: "rgba(30, 41, 59, 0.6)",
    borderRadius: "16px",
    padding: "20px",
    border: "1px solid rgba(255, 255, 255, 0.05)"
  },
  
  progressHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px"
  },
  
  progressLabel: {
    fontSize: "14px",
    color: "#e2e8f0",
    fontWeight: "500"
  },
  
  progressPercent: {
    fontSize: "18px",
    fontWeight: "700",
    background: "linear-gradient(135deg, #667eea, #9f7aea)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent"
  },
  
  progressContainer: {
    height: "8px",
    background: "rgba(255, 255, 255, 0.05)",
    borderRadius: "4px",
    overflow: "hidden",
    marginBottom: "12px"
  },
  
  progressBar: {
    height: "100%",
    borderRadius: "4px",
    transition: "width 0.3s ease"
  },
  
  statusMessage: {
    fontSize: "13px",
    color: "#94a3b8",
    margin: 0,
    textAlign: "center"
  },
  
  settingsCard: {
    background: "rgba(30, 41, 59, 0.6)",
    borderRadius: "16px",
    padding: "20px",
    border: "1px solid rgba(255, 255, 255, 0.05)"
  },
  
  settingsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px"
  },
  
  settingsTitle: {
    fontSize: "16px",
    fontWeight: "600",
    color: "#ffffff",
    margin: 0
  },
  
  settingsIcon: {
    fontSize: "20px",
    opacity: 0.7
  },
  
  settingItem: {
    marginBottom: "16px",
    ":last-child": {
      marginBottom: 0
    }
  },
  
  settingLabel: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    cursor: "pointer"
  },
  
  settingInfo: {
    display: "flex",
    flexDirection: "column",
    flex: 1
  },
  
  settingName: {
    fontSize: "14px",
    color: "#e2e8f0",
    fontWeight: "500",
    marginBottom: "4px"
  },
  
  settingDescription: {
    fontSize: "12px",
    color: "#94a3b8"
  },
  
  switchContainer: {
    position: "relative",
    width: "52px",
    height: "28px"
  },
  
  switchInput: {
    opacity: 0,
    width: 0,
    height: 0,
    position: "absolute"
  },
  
  switchSlider: {
    position: "absolute",
    cursor: "pointer",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: "34px",
    transition: ".4s",
    ":before": {
      position: "absolute",
      content: '""',
      height: "20px",
      width: "20px",
      left: "4px",
      bottom: "4px",
      backgroundColor: "white",
      borderRadius: "50%",
      transition: ".4s",
      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)"
    }
  },
  
  resultsCard: {
    background: "rgba(30, 41, 59, 0.6)",
    borderRadius: "20px",
    padding: "24px",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
    height: "100%",
    display: "flex",
    flexDirection: "column"
  },
  
  resultsHeader: {
    marginBottom: "24px"
  },
  
  resultsTitle: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px"
  },
  
  resultsStats: {
    display: "flex",
    gap: "16px"
  },
  
  resultsStat: {
    textAlign: "center"
  },
  
  resultsStatValue: {
    fontSize: "24px",
    fontWeight: "800",
    background: "linear-gradient(135deg, #667eea, #9f7aea)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    lineHeight: 1
  },
  
  resultsStatLabel: {
    fontSize: "12px",
    color: "#94a3b8",
    marginTop: "4px"
  },
  
  topGroups: {
    background: "rgba(15, 23, 42, 0.4)",
    borderRadius: "12px",
    padding: "16px"
  },
  
  topGroupsTitle: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#e2e8f0",
    marginBottom: "12px"
  },
  
  topGroupsList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px"
  },
  
  topGroupItem: {
    display: "flex",
    alignItems: "center",
    gap: "12px"
  },
  
  topGroupRank: {
    width: "24px",
    height: "24px",
    background: "linear-gradient(135deg, #667eea, #9f7aea)",
    borderRadius: "6px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    fontWeight: "700",
    color: "white"
  },
  
  topGroupContent: {
    flex: 1,
    minWidth: 0
  },
  
  topGroupName: {
    fontSize: "13px",
    color: "#ffffff",
    fontWeight: "500",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  
  topGroupCount: {
    fontSize: "11px",
    color: "#94a3b8",
    marginTop: "2px"
  },
  
  topGroupBar: {
    flex: 2,
    height: "6px",
    background: "rgba(255, 255, 255, 0.05)",
    borderRadius: "3px",
    overflow: "hidden"
  },
  
  topGroupBarFill: {
    height: "100%",
    background: "linear-gradient(90deg, #667eea, #9f7aea)",
    borderRadius: "3px",
    transition: "width 0.5s ease"
  },
  
  tableContainer: {
    flex: 1,
    overflow: "hidden",
    borderRadius: "12px",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    background: "rgba(15, 23, 42, 0.4)"
  },
  
  tableHeader: {
    display: "grid",
    gridTemplateColumns: "80px 1fr 120px 140px",
    background: "rgba(30, 41, 59, 0.8)",
    padding: "16px 20px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
    position: "sticky",
    top: 0,
    zIndex: 10
  },
  
  tableHeaderCell: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.5px"
  },
  
  tableBody: {
    maxHeight: "500px",
    overflowY: "auto"
  },
  
  separatorRow: {
    background: "rgba(102, 126, 234, 0.05)",
    borderTop: "1px solid rgba(102, 126, 234, 0.2)",
    borderBottom: "1px solid rgba(102, 126, 234, 0.2)"
  },
  
  separatorContent: {
    padding: "12px 20px"
  },
  
  separatorLine: {
    display: "flex",
    alignItems: "center",
    gap: "16px"
  },
  
  separatorDashes: {
    color: "#667eea",
    fontSize: "12px",
    opacity: 0.5,
    flexShrink: 0
  },
  
  separatorLabel: {
    display: "flex",
    alignItems: "center",
    gap: "12px"
  },
  
  separatorGroup: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#667eea",
    background: "rgba(102, 126, 234, 0.1)",
    padding: "4px 12px",
    borderRadius: "12px"
  },
  
  separatorCount: {
    fontSize: "12px",
    color: "#94a3b8",
    background: "rgba(255, 255, 255, 0.05)",
    padding: "2px 8px",
    borderRadius: "8px"
  },
  
  dataRow: {
    display: "grid",
    gridTemplateColumns: "80px 1fr 120px 140px",
    padding: "16px 20px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.03)",
    ":hover": {
      background: "rgba(255, 255, 255, 0.02)"
    },
    ":nth-child(odd)": {
      background: "rgba(255, 255, 255, 0.01)"
    }
  },
  
  dataCell: {
    display: "flex",
    alignItems: "center"
  },
  
  nameCell: {
    display: "flex",
    flexDirection: "column",
    gap: "6px"
  },
  
  namePrimary: {
    fontSize: "14px",
    color: "#ffffff",
    fontWeight: "500"
  },
  
  nameDetails: {
    display: "flex",
    gap: "12px",
    fontSize: "11px"
  },
  
  nameDetail: {
    display: "flex",
    alignItems: "center",
    gap: "4px"
  },
  
  nameDetailLabel: {
    color: "#64748b"
  },
  
  nameDetailValue: {
    color: "#cbd5e1",
    fontWeight: "500",
    background: "rgba(255, 255, 255, 0.05)",
    padding: "2px 6px",
    borderRadius: "4px"
  },
  
  dobCell: {
    fontSize: "13px",
    color: "#cbd5e1",
    fontWeight: "500"
  },
  
  ssnCell: {
    fontSize: "13px",
    color: "#cbd5e1",
    fontWeight: "500",
    fontFamily: "monospace"
  },
  
  previewNote: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "rgba(56, 189, 248, 0.1)",
    padding: "12px 16px",
    borderRadius: "12px",
    marginTop: "16px",
    border: "1px solid rgba(56, 189, 248, 0.2)"
  },
  
  previewNoteIcon: {
    fontSize: "16px"
  },
  
  previewNoteText: {
    fontSize: "13px",
    color: "#38bdf8"
  },
  
  footer: {
    marginTop: "32px",
    paddingTop: "24px",
    borderTop: "1px solid rgba(255, 255, 255, 0.1)"
  },
  
  footerContent: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  
  footerText: {
    fontSize: "13px",
    color: "#64748b"
  },
  
  footerStats: {
    display: "flex",
    alignItems: "center"
  },
  
  processingStats: {
    display: "flex",
    alignItems: "center",
    gap: "8px"
  },
  
  processingText: {
    fontSize: "13px",
    color: "#94a3b8"
  }
};

// Add global styles
const globalStyles = document.createElement('style');
globalStyles.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  body {
    margin: 0;
    overflow-x: hidden;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  
  input:checked + span {
    background-color: rgba(102, 126, 234, 0.5);
  }
  
  input:checked + span:before {
    transform: translateX(24px);
  }
  
  input:focus + span {
    box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.3);
  }
  
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  
  ::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
  }
  
  ::-webkit-scrollbar-thumb {
    background: rgba(102, 126, 234, 0.3);
    border-radius: 4px;
  }
  
  ::-webkit-scrollbar-thumb:hover {
    background: rgba(102, 126, 234, 0.5);
  }
`;
document.head.appendChild(globalStyles);