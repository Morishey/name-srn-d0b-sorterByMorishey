import React, { useState, useCallback, useMemo, useEffect } from "react";

export default function App() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [includeSeparators, setIncludeSeparators] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile screen on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
      setStatus(`✅ ${output.length.toLocaleString()} records sorted`);
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

  // Responsive preview display
  const previewRows = useMemo(() => {
    if (results.length === 0) return [];
    const maxRows = isMobile ? 10 : 20;
    return results.slice(0, Math.min(maxRows, results.length));
  }, [results, isMobile]);

  const fileSizeMB = useMemo(() => {
    return file ? (file.size / (1024 * 1024)).toFixed(2) : 0;
  }, [file]);

  return (
    <div style={styles.page}>
      {/* Mobile overlay for better UX */}
      {isMobile && (
        <div style={styles.mobileOverlay}>
          <div style={styles.mobileIcon}>📱</div>
          <p style={styles.mobileText}>Mobile Mode Active</p>
        </div>
      )}
      
      <div style={styles.card}>
        {/* Responsive Header */}
        <header style={styles.header}>
          <div style={styles.logo}>
            <div style={styles.logoIcon}>📊</div>
            <div style={styles.logoText}>
              <h1 style={styles.title}>Mosort Pro</h1>
              <p style={styles.subtitle}>
                {isMobile ? "File Processor" : "Intelligent Text File Processor"}
              </p>
            </div>
          </div>
          
          {!isMobile && (
            <div style={styles.headerStats}>
              <div style={styles.statCard}>
                <div style={styles.statIcon}>⚡</div>
                <div style={styles.statContent}>
                  <div style={styles.statValue}>Fast</div>
                  <div style={styles.statLabel}>Processing</div>
                </div>
              </div>
            </div>
          )}
        </header>

        {/* Main Content - Stack on mobile */}
        <div style={styles.mainContent}>
          
          {/* File Upload Section */}
          <div style={styles.section}>
            <div style={styles.uploadCard}>
              <div style={styles.uploadHeader}>
                <h3 style={styles.cardTitle}>
                  {isMobile ? "📁 Upload File" : "File Upload"}
                </h3>
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
                  </div>
                  <p style={styles.uploadText}>
                    {file ? (
                      <span style={styles.fileNameActive}>{fileName}</span>
                    ) : isMobile ? (
                      "Tap to select file"
                    ) : (
                      "Drag & drop or click to browse"
                    )}
                  </p>
                  {file && (
                    <div style={styles.fileInfo}>
                      <div style={styles.fileInfoRow}>
                        <span style={styles.fileInfoLabel}>Size:</span>
                        <span style={styles.fileInfoValue}>{fileSizeMB} MB</span>
                      </div>
                      <div style={styles.fileInfoRow}>
                        <span style={styles.fileInfoLabel}>Status:</span>
                        <span style={styles.fileInfoValueReady}>Ready</span>
                      </div>
                    </div>
                  )}
                  {!file && (
                    <div style={styles.uploadHint}>
                      .txt files with tab-separated values
                    </div>
                  )}
                </div>
              </label>
            </div>

            {/* Processing Controls */}
            <div style={styles.controlsCard}>
              <div style={styles.controlsHeader}>
                <h3 style={styles.cardTitle}>
                  {isMobile ? "⚙️ Controls" : "Processing Controls"}
                </h3>
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
                  ...(processing && styles.disabledButton),
                  ...(isMobile && styles.mobileButton)
                }}
              >
                <div style={styles.buttonContent}>
                  {processing ? (
                    <>
                      <div style={styles.spinnerContainer}>
                        <div style={styles.spinner}></div>
                      </div>
                      <span>{isMobile ? "Processing..." : "Processing Data..."}</span>
                    </>
                  ) : (
                    <>
                      <div style={styles.buttonIcon}>🚀</div>
                      <span>{isMobile ? "Process File" : "Start Processing"}</span>
                    </>
                  )}
                </div>
              </button>

              {/* Progress Section */}
              <div style={styles.progressCard}>
                <div style={styles.progressHeader}>
                  <span style={styles.progressLabel}>Progress</span>
                  <span style={styles.progressPercent}>{progress}%</span>
                </div>
                <div style={styles.progressContainer}>
                  <div 
                    style={{ 
                      ...styles.progressBar,
                      width: `${progress}%`,
                      background: progress === 100 ? 
                        'linear-gradient(90deg, #10b981, #059669)' :
                        'linear-gradient(90deg, #667eea, #9f7aea, #667eea)'
                    }} 
                  />
                </div>
                <p style={styles.statusMessage}>
                  {status || (isMobile ? "Upload file to start" : "Upload a file to begin")}
                </p>
              </div>

              {/* Settings - Collapsible on mobile */}
              <div style={styles.settingsCard}>
                <div style={styles.settingsHeader}>
                  <h4 style={styles.settingsTitle}>
                    {isMobile ? "⚙️ Settings" : "Output Settings"}
                  </h4>
                </div>
                
                <div style={styles.settingItem}>
                  <label style={styles.settingLabel}>
                    <div style={styles.settingInfo}>
                      <span style={styles.settingName}>
                        {isMobile ? "Add Separators" : "Group Separators"}
                      </span>
                      {!isMobile && (
                        <span style={styles.settingDescription}>
                          Add visual separators between name groups
                        </span>
                      )}
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

              {/* Download Button */}
              {results.length > 0 && (
                <button
                  onClick={saveFile}
                  style={{
                    ...styles.button,
                    ...styles.successButton,
                    ...(isMobile && styles.mobileButton)
                  }}
                >
                  <div style={styles.buttonContent}>
                    <div style={styles.buttonIcon}>💾</div>
                    <div style={styles.saveButtonText}>
                      <div style={styles.saveButtonMain}>
                        {isMobile ? "Download" : "Download Sorted File"}
                      </div>
                      {!isMobile && (
                        <div style={styles.saveButtonSub}>
                          {results.length.toLocaleString()} records
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* Results Section */}
          <div style={styles.section}>
            <div style={styles.resultsCard}>
              <div style={styles.resultsHeader}>
                <div style={styles.resultsTitle}>
                  <h3 style={styles.cardTitle}>
                    {results.length > 0 ? '📋 Results' : '📊 Preview'}
                  </h3>
                  {results.length > 0 && (
                    <div style={styles.resultsStats}>
                      <div style={styles.resultsStat}>
                        <div style={styles.resultsStatValue}>{results.length}</div>
                        <div style={styles.resultsStatLabel}>Records</div>
                      </div>
                      {!isMobile && (
                        <div style={styles.resultsStat}>
                          <div style={styles.resultsStatValue}>
                            {new Set(results.map(r => `${r.firstName} ${r.lastName}`)).size}
                          </div>
                          <div style={styles.resultsStatLabel}>Unique Names</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Results Display - Responsive table */}
              {results.length > 0 ? (
                <div style={styles.tableContainer}>
                  {!isMobile ? (
                    // Desktop Table
                    <>
                      <div style={styles.tableHeader}>
                        <div style={styles.tableHeaderCell}>#</div>
                        <div style={styles.tableHeaderCell}>Name</div>
                        <div style={styles.tableHeaderCell}>DOB</div>
                        <div style={styles.tableHeaderCell}>SSN</div>
                      </div>
                      
                      <div style={styles.tableBody}>
                        {previewRows.map((item, index) => (
                          <div key={index} style={styles.dataRow}>
                            <div style={styles.dataCell}>{index + 1}</div>
                            <div style={styles.dataCell}>
                              <div style={styles.nameCell}>
                                <div style={styles.namePrimary}>{item.name}</div>
                                <div style={styles.nameDetails}>
                                  <span style={styles.nameDetail}>
                                    <span style={styles.nameDetailValue}>{item.firstName}</span>
                                  </span>
                                  <span style={styles.nameDetail}>
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
                        ))}
                      </div>
                    </>
                  ) : (
                    // Mobile Card List
                    <div style={styles.mobileList}>
                      {previewRows.map((item, index) => (
                        <div key={index} style={styles.mobileCard}>
                          <div style={styles.mobileCardHeader}>
                            <div style={styles.mobileCardNumber}>{index + 1}</div>
                            <div style={styles.mobileCardTitle}>{item.name}</div>
                          </div>
                          <div style={styles.mobileCardDetails}>
                            <div style={styles.mobileDetail}>
                              <span style={styles.mobileDetailLabel}>DOB:</span>
                              <span style={styles.mobileDetailValue}>{item.dob}</span>
                            </div>
                            <div style={styles.mobileDetail}>
                              <span style={styles.mobileDetailLabel}>SSN:</span>
                              <span style={styles.mobileDetailValue}>{item.ssn}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {results.length > previewRows.length && (
                    <div style={styles.tableFooter}>
                      Showing {previewRows.length} of {results.length.toLocaleString()} records
                    </div>
                  )}
                </div>
              ) : (
                <div style={styles.emptyState}>
                  <div style={styles.emptyStateIcon}>📊</div>
                  <h4 style={styles.emptyStateTitle}>No Data Processed</h4>
                  <p style={styles.emptyStateText}>
                    {isMobile ? 
                      "Upload and process a file to see results" : 
                      "Upload a .txt file and process it to see results here"
                    }
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Footer */}
        {isMobile && (
          <footer style={styles.mobileFooter}>
            <div style={styles.mobileFooterContent}>
              <span style={styles.mobileFooterText}>Mosort Pro • Mobile</span>
              {processing && (
                <div style={styles.mobileProgress}>
                  <span style={styles.mobileProgressText}>Processing: {progress}%</span>
                </div>
              )}
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    padding: "16px",
    position: "relative",
    '@media (max-width: 768px)': {
      padding: "12px"
    }
  },
  
  // Mobile Overlay Indicator
  mobileOverlay: {
    position: 'fixed',
    top: '10px',
    right: '10px',
    background: 'rgba(102, 126, 234, 0.2)',
    backdropFilter: 'blur(10px)',
    borderRadius: '20px',
    padding: '8px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    zIndex: 1000,
    border: '1px solid rgba(102, 126, 234, 0.3)'
  },
  
  mobileIcon: {
    fontSize: '20px'
  },
  
  mobileText: {
    fontSize: '12px',
    color: '#e2e8f0',
    fontWeight: '500'
  },
  
  // Main Card
  card: {
    background: "rgba(30, 41, 59, 0.9)",
    backdropFilter: "blur(10px)",
    borderRadius: "20px",
    padding: "24px",
    width: "100%",
    maxWidth: "1400px",
    margin: "0 auto",
    boxShadow: "0 10px 40px rgba(0, 0, 0, 0.3)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    '@media (max-width: 768px)': {
      padding: "16px",
      borderRadius: "16px"
    }
  },
  
  // Header
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "32px",
    paddingBottom: "20px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
    '@media (max-width: 768px)': {
      flexDirection: 'column',
      gap: '16px',
      alignItems: 'flex-start',
      marginBottom: '24px',
      paddingBottom: '16px'
    }
  },
  
  logo: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    '@media (max-width: 768px)': {
      gap: '12px'
    }
  },
  
  logoIcon: {
    fontSize: "40px",
    background: "linear-gradient(135deg, #667eea, #9f7aea)",
    borderRadius: "12px",
    width: "52px",
    height: "52px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 20px rgba(102, 126, 234, 0.3)",
    '@media (max-width: 768px)': {
      width: '44px',
      height: '44px',
      fontSize: '32px'
    }
  },
  
  logoText: {
    display: "flex",
    flexDirection: "column",
    '@media (max-width: 768px)': {
      flex: 1
    }
  },
  
  title: {
    fontSize: "28px",
    fontWeight: "800",
    background: "linear-gradient(135deg, #ffffff, #cbd5e1)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    margin: "0 0 4px 0",
    letterSpacing: "-0.5px",
    '@media (max-width: 768px)': {
      fontSize: '24px'
    }
  },
  
  subtitle: {
    fontSize: "14px",
    color: "#94a3b8",
    margin: 0,
    fontWeight: "500",
    '@media (max-width: 768px)': {
      fontSize: '12px'
    }
  },
  
  headerStats: {
    display: "flex",
    gap: "12px",
    '@media (max-width: 768px)': {
      width: '100%',
      justifyContent: 'center'
    }
  },
  
  statCard: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    background: "rgba(30, 41, 59, 0.6)",
    padding: "10px 16px",
    borderRadius: "10px",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    '@media (max-width: 768px)': {
      padding: '8px 12px'
    }
  },
  
  statIcon: {
    fontSize: "18px",
    '@media (max-width: 768px)': {
      fontSize: '16px'
    }
  },
  
  statContent: {
    display: "flex",
    flexDirection: "column"
  },
  
  statValue: {
    fontSize: "14px",
    fontWeight: "700",
    color: "#ffffff",
    '@media (max-width: 768px)': {
      fontSize: '12px'
    }
  },
  
  statLabel: {
    fontSize: "11px",
    color: "#94a3b8",
    '@media (max-width: 768px)': {
      fontSize: '10px'
    }
  },
  
  // Main Content Layout
  mainContent: {
    display: "flex",
    flexDirection: "column",
    gap: "24px",
    marginBottom: "32px",
    '@media (min-width: 769px)': {
      display: 'grid',
      gridTemplateColumns: '1fr 1.5fr',
      gap: '32px'
    }
  },
  
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "20px"
  },
  
  // Upload Card
  uploadCard: {
    background: "rgba(30, 41, 59, 0.6)",
    borderRadius: "16px",
    padding: "20px",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)",
    '@media (max-width: 768px)': {
      padding: '16px'
    }
  },
  
  uploadHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px"
  },
  
  cardTitle: {
    fontSize: "16px",
    fontWeight: "700",
    color: "#ffffff",
    margin: 0,
    '@media (max-width: 768px)': {
      fontSize: '15px'
    }
  },
  
  fileTypeBadge: {
    background: "rgba(102, 126, 234, 0.2)",
    color: "#667eea",
    padding: "4px 10px",
    borderRadius: "16px",
    fontSize: "11px",
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
    borderRadius: "12px",
    padding: "32px 20px",
    background: "rgba(15, 23, 42, 0.4)",
    transition: "all 0.3s ease",
    textAlign: "center",
    ':hover': {
      borderColor: "#667eea",
      background: "rgba(15, 23, 42, 0.6)"
    },
    '@media (max-width: 768px)': {
      padding: '24px 16px'
    }
  },
  
  uploadIconContainer: {
    marginBottom: "12px"
  },
  
  uploadIcon: {
    fontSize: "40px",
    color: "#667eea",
    '@media (max-width: 768px)': {
      fontSize: '36px'
    }
  },
  
  uploadText: {
    fontSize: "15px",
    color: "#e2e8f0",
    margin: "0 0 12px 0",
    fontWeight: "500",
    '@media (max-width: 768px)': {
      fontSize: '14px'
    }
  },
  
  fileNameActive: {
    color: '#667eea',
    fontWeight: '600',
    wordBreak: 'break-word'
  },
  
  fileInfo: {
    background: "rgba(30, 41, 59, 0.6)",
    borderRadius: "10px",
    padding: "12px",
    marginBottom: "12px",
    '@media (max-width: 768px)': {
      padding: '10px'
    }
  },
  
  fileInfoRow: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "6px",
    ':last-child': {
      marginBottom: 0
    }
  },
  
  fileInfoLabel: {
    fontSize: "12px",
    color: "#94a3b8",
    '@media (max-width: 768px)': {
      fontSize: '11px'
    }
  },
  
  fileInfoValue: {
    fontSize: "12px",
    color: "#ffffff",
    fontWeight: "500",
    '@media (max-width: 768px)': {
      fontSize: '11px'
    }
  },
  
  fileInfoValueReady: {
    fontSize: "12px",
    color: "#48bb78",
    fontWeight: "600",
    '@media (max-width: 768px)': {
      fontSize: '11px'
    }
  },
  
  uploadHint: {
    fontSize: "11px",
    color: "#64748b",
    fontStyle: "italic",
    '@media (max-width: 768px)': {
      fontSize: '10px'
    }
  },
  
  // Controls Card
  controlsCard: {
    display: "flex",
    flexDirection: "column",
    gap: "16px"
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
    fontSize: "12px",
    color: "#94a3b8",
    '@media (max-width: 768px)': {
      fontSize: '11px'
    }
  },
  
  // Buttons
  button: {
    padding: "16px 20px",
    borderRadius: "12px",
    border: "none",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.3s ease",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    width: "100%",
    '@media (max-width: 768px)': {
      padding: '14px 16px',
      fontSize: '14px'
    }
  },
  
  mobileButton: {
    padding: '14px',
    fontSize: '14px',
    gap: '8px'
  },
  
  buttonContent: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    '@media (max-width: 768px)': {
      gap: '8px'
    }
  },
  
  primaryButton: {
    background: "linear-gradient(135deg, #667eea 0%, #9f7aea 100%)",
    color: "white",
    boxShadow: "0 4px 20px rgba(102, 126, 234, 0.4)",
    ':hover': {
      transform: "translateY(-2px)",
      boxShadow: "0 8px 30px rgba(102, 126, 234, 0.5)"
    },
    '@media (max-width: 768px)': {
      ':active': {
        transform: "scale(0.98)"
      }
    }
  },
  
  successButton: {
    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    color: "white",
    boxShadow: "0 4px 20px rgba(16, 185, 129, 0.4)",
    ':hover': {
      transform: "translateY(-2px)",
      boxShadow: "0 8px 30px rgba(16, 185, 129, 0.5)"
    }
  },
  
  disabledButton: {
    opacity: 0.6,
    cursor: "not-allowed",
    ':hover': {
      transform: "none",
      boxShadow: "0 4px 20px rgba(102, 126, 234, 0.4)"
    }
  },
  
  buttonIcon: {
    fontSize: "18px",
    '@media (max-width: 768px)': {
      fontSize: '16px'
    }
  },
  
  spinnerContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  
  spinner: {
    width: "18px",
    height: "18px",
    border: "2px solid rgba(255,255,255,0.3)",
    borderTop: "2px solid white",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    '@media (max-width: 768px)': {
      width: '16px',
      height: '16px'
    }
  },
  
  saveButtonText: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    textAlign: "left"
  },
  
  saveButtonMain: {
    fontSize: "15px",
    fontWeight: "600",
    '@media (max-width: 768px)': {
      fontSize: '14px'
    }
  },
  
  saveButtonSub: {
    fontSize: "11px",
    opacity: 0.9,
    fontWeight: "400",
    '@media (max-width: 768px)': {
      fontSize: '10px'
    }
  },
  
  // Progress Card
  progressCard: {
    background: "rgba(30, 41, 59, 0.6)",
    borderRadius: "12px",
    padding: "16px",
    border: "1px solid rgba(255, 255, 255, 0.05)"
  },
  
  progressHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "10px"
  },
  
  progressLabel: {
    fontSize: "13px",
    color: "#e2e8f0",
    fontWeight: "500",
    '@media (max-width: 768px)': {
      fontSize: '12px'
    }
  },
  
  progressPercent: {
    fontSize: "16px",
    fontWeight: "700",
    background: "linear-gradient(135deg, #667eea, #9f7aea)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    '@media (max-width: 768px)': {
      fontSize: '15px'
    }
  },
  
  progressContainer: {
    height: "6px",
    background: "rgba(255, 255, 255, 0.05)",
    borderRadius: "3px",
    overflow: "hidden",
    marginBottom: "10px"
  },
  
  progressBar: {
    height: "100%",
    borderRadius: "3px",
    transition: "width 0.3s ease"
  },
  
  statusMessage: {
    fontSize: "12px",
    color: "#94a3b8",
    margin: 0,
    textAlign: "center",
    minHeight: "18px",
    '@media (max-width: 768px)': {
      fontSize: '11px'
    }
  },
  
  // Settings Card
  settingsCard: {
    background: "rgba(30, 41, 59, 0.6)",
    borderRadius: "12px",
    padding: "16px",
    border: "1px solid rgba(255, 255, 255, 0.05)"
  },
  
  settingsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px"
  },
  
  settingsTitle: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#ffffff",
    margin: 0,
    '@media (max-width: 768px)': {
      fontSize: '13px'
    }
  },
  
  settingItem: {
    marginBottom: "12px",
    ':last-child': {
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
    fontSize: "13px",
    color: "#e2e8f0",
    fontWeight: "500",
    marginBottom: "4px",
    '@media (max-width: 768px)': {
      fontSize: '12px'
    }
  },
  
  settingDescription: {
    fontSize: "11px",
    color: "#94a3b8",
    '@media (max-width: 768px)': {
      fontSize: '10px'
    }
  },
  
  switchContainer: {
    position: "relative",
    width: "48px",
    height: "26px",
    '@media (max-width: 768px)': {
      width: '44px',
      height: '24px'
    }
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
    ':before': {
      position: "absolute",
      content: '""',
      height: "18px",
      width: "18px",
      left: "4px",
      bottom: "4px",
      backgroundColor: "white",
      borderRadius: "50%",
      transition: ".4s",
      boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)"
    },
    '@media (max-width: 768px)': {
      ':before': {
        height: '16px',
        width: '16px'
      }
    }
  },
  
  // Results Card
  resultsCard: {
    background: "rgba(30, 41, 59, 0.6)",
    borderRadius: "16px",
    padding: "20px",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    minHeight: "400px",
    '@media (max-width: 768px)': {
      padding: '16px',
      minHeight: '300px'
    }
  },
  
  resultsHeader: {
    marginBottom: "20px"
  },
  
  resultsTitle: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
    '@media (max-width: 768px)': {
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: '12px'
    }
  },
  
  resultsStats: {
    display: "flex",
    gap: "16px",
    '@media (max-width: 768px)': {
      width: '100%',
      justifyContent: 'space-between'
    }
  },
  
  resultsStat: {
    textAlign: "center",
    '@media (max-width: 768px)': {
      textAlign: 'left'
    }
  },
  
  resultsStatValue: {
    fontSize: "22px",
    fontWeight: "800",
    background: "linear-gradient(135deg, #667eea, #9f7aea)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    lineHeight: 1,
    '@media (max-width: 768px)': {
      fontSize: '20px'
    }
  },
  
  resultsStatLabel: {
    fontSize: "11px",
    color: "#94a3b8",
    marginTop: "4px",
    '@media (max-width: 768px)': {
      fontSize: '10px'
    }
  },
  
  // Table Container
  tableContainer: {
    flex: 1,
    overflow: "hidden",
    borderRadius: "10px",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    background: "rgba(15, 23, 42, 0.4)",
    display: "flex",
    flexDirection: "column"
  },
  
  tableHeader: {
    display: "grid",
    gridTemplateColumns: "60px 1fr 100px 120px",
    background: "rgba(30, 41, 59, 0.8)",
    padding: "12px 16px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
    position: "sticky",
    top: 0,
    zIndex: 10,
    '@media (max-width: 1024px)': {
      gridTemplateColumns: '50px 1fr 90px 110px'
    }
  },
  
  tableHeaderCell: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    '@media (max-width: 1024px)': {
      fontSize: '11px'
    }
  },
  
  tableBody: {
    flex: 1,
    overflowY: "auto",
    maxHeight: "400px"
  },
  
  dataRow: {
    display: "grid",
    gridTemplateColumns: "60px 1fr 100px 120px",
    padding: "12px 16px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.03)",
    ':hover': {
      background: "rgba(255, 255, 255, 0.02)"
    },
    ':nth-child(odd)': {
      background: "rgba(255, 255, 255, 0.01)"
    },
    '@media (max-width: 1024px)': {
      gridTemplateColumns: '50px 1fr 90px 110px',
      padding: '10px 12px'
    }
  },
  
  dataCell: {
    display: "flex",
    alignItems: "center"
  },
  
  nameCell: {
    display: "flex",
    flexDirection: "column",
    gap: "4px"
  },
  
  namePrimary: {
    fontSize: "13px",
    color: "#ffffff",
    fontWeight: "500",
    lineHeight: "1.3",
    wordBreak: "break-word",
    '@media (max-width: 1024px)': {
      fontSize: '12px'
    }
  },
  
  nameDetails: {
    display: "flex",
    gap: "8px",
    fontSize: "10px"
  },
  
  nameDetail: {
    display: "flex",
    alignItems: "center",
    gap: "2px"
  },
  
  nameDetailValue: {
    color: "#cbd5e1",
    fontWeight: "500",
    background: "rgba(255, 255, 255, 0.05)",
    padding: "2px 6px",
    borderRadius: "4px",
    fontSize: "10px"
  },
  
  dobCell: {
    fontSize: "12px",
    color: "#cbd5e1",
    fontWeight: "500",
    '@media (max-width: 1024px)': {
      fontSize: '11px'
    }
  },
  
  ssnCell: {
    fontSize: "12px",
    color: "#cbd5e1",
    fontWeight: "500",
    fontFamily: "monospace",
    '@media (max-width: 1024px)': {
      fontSize: '11px'
    }
  },
  
  // Mobile List View
  mobileList: {
    flex: 1,
    overflowY: "auto",
    padding: "8px"
  },
  
  mobileCard: {
    background: "rgba(30, 41, 59, 0.6)",
    borderRadius: "10px",
    padding: "12px",
    marginBottom: "8px",
    border: "1px solid rgba(255, 255, 255, 0.05)"
  },
  
  mobileCardHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "8px"
  },
  
  mobileCardNumber: {
    background: "linear-gradient(135deg, #667eea, #9f7aea)",
    color: "white",
    width: "28px",
    height: "28px",
    borderRadius: "6px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    fontWeight: "700"
  },
  
  mobileCardTitle: {
    fontSize: "14px",
    color: "#ffffff",
    fontWeight: "600",
    flex: 1,
    wordBreak: "break-word"
  },
  
  mobileCardDetails: {
    display: "flex",
    flexDirection: "column",
    gap: "6px"
  },
  
  mobileDetail: {
    display: "flex",
    gap: "8px",
    fontSize: "12px"
  },
  
  mobileDetailLabel: {
    color: "#94a3b8",
    minWidth: "40px"
  },
  
  mobileDetailValue: {
    color: "#ffffff",
    fontWeight: "500",
    wordBreak: "break-all"
  },
  
  // Table Footer
  tableFooter: {
    padding: "10px 16px",
    fontSize: "11px",
    color: "#64748b",
    textAlign: "center",
    background: "rgba(30, 41, 59, 0.8)",
    borderTop: "1px solid rgba(255, 255, 255, 0.05)",
    '@media (max-width: 768px)': {
      padding: '8px 12px',
      fontSize: '10px'
    }
  },
  
  // Empty State
  emptyState: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "40px 20px",
    textAlign: "center"
  },
  
  emptyStateIcon: {
    fontSize: "48px",
    marginBottom: "16px",
    opacity: 0.5,
    '@media (max-width: 768px)': {
      fontSize: '40px'
    }
  },
  
  emptyStateTitle: {
    fontSize: "18px",
    color: "#ffffff",
    margin: "0 0 8px 0",
    fontWeight: "600",
    '@media (max-width: 768px)': {
      fontSize: '16px'
    }
  },
  
  emptyStateText: {
    fontSize: "14px",
    color: "#94a3b8",
    maxWidth: "300px",
    lineHeight: "1.5",
    '@media (max-width: 768px)': {
      fontSize: '13px'
    }
  },
  
  // Mobile Footer
  mobileFooter: {
    marginTop: "24px",
    paddingTop: "16px",
    borderTop: "1px solid rgba(255, 255, 255, 0.1)"
  },
  
  mobileFooterContent: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  
  mobileFooterText: {
    fontSize: "11px",
    color: "#64748b"
  },
  
  mobileProgress: {
    display: "flex",
    alignItems: "center",
    gap: "8px"
  },
  
  mobileProgressText: {
    fontSize: "11px",
    color: "#94a3b8"
  }
};

// Add global styles with responsive media queries
const globalStyles = document.createElement('style');
globalStyles.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
  
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  body {
    margin: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
  
  input:checked + span {
    background-color: rgba(102, 126, 234, 0.5);
  }
  
  input:checked + span:before {
    transform: translateX(22px);
  }
  
  @media (max-width: 768px) {
    input:checked + span:before {
      transform: translateX(20px);
    }
  }
  
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  
  ::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 3px;
  }
  
  ::-webkit-scrollbar-thumb {
    background: rgba(102, 126, 234, 0.3);
    border-radius: 3px;
  }
  
  ::-webkit-scrollbar-thumb:hover {
    background: rgba(102, 126, 234, 0.5);
  }
  
  /* Touch-friendly styles for mobile */
  @media (max-width: 768px) {
    button, 
    input[type="checkbox"] + span,
    label {
      -webkit-tap-highlight-color: transparent;
    }
    
    button:active {
      opacity: 0.8;
    }
    
    /* Prevent zoom on input focus */
    input, select, textarea {
      font-size: 16px;
    }
  }
  
  /* Print styles */
  @media print {
    .no-print {
      display: none !important;
    }
  }
`;
document.head.appendChild(globalStyles);