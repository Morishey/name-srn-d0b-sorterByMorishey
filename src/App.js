import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";

export default function App() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [includeSeparators, setIncludeSeparators] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [fileFormat, setFileFormat] = useState("auto");
  const [sortOrder, setSortOrder] = useState("first-last");
  const [filters, setFilters] = useState({
    minYear: 1940,
    maxYear: new Date().getFullYear(),
    uniqueOnly: false
  });
  const [stats, setStats] = useState({
    totalRecords: 0,
    validRecords: 0,
    duplicateRecords: 0,
    invalidRecords: 0
  });
  const [copySuccess, setCopySuccess] = useState('');
  const fileInputRef = useRef(null);
  
  const donationAddress = "TWWKNV2YXH9HHnCCSEmnAm8tUmrrKA7XN7";

  // Detect mobile screen
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const CHUNK_SIZE = 10000;

  // Copy to clipboard function
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(donationAddress);
      setCopySuccess('✅ USDT (TRC-20) address copied!');
      setTimeout(() => setCopySuccess(''), 3000);
    } catch (err) {
      setCopySuccess('❌ Failed to copy');
    }
  };

  const extractFirstAndLastName = useCallback((fullName) => {
    const parts = fullName.trim().split(" ");
    const firstName = parts[0] || "";
    const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
    const middleName = parts.length > 2 ? parts.slice(1, -1).join(" ") : "";
    return { firstName, lastName, middleName, fullName: fullName.trim() };
  }, []);

  const parseDate = useCallback((dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  }, []);

  const handleFile = useCallback((e) => {
    const f = e.target.files[0];
    if (!f) return;

    if (!f.name.toLowerCase().endsWith('.txt')) {
      alert("Please upload a .txt file");
      return;
    }

    setFile(f);
    setFileName(f.name);
    setProgress(0);
    setStatus("File loaded. Ready to sort.");
    setResults([]);
    setStats({
      totalRecords: 0,
      validRecords: 0,
      duplicateRecords: 0,
      invalidRecords: 0
    });
  }, []);

  const detectFileFormat = useCallback((firstFewLines) => {
    for (const line of firstFewLines) {
      if (line.includes("|")) {
        const parts = line.split("|");
        if (parts.length >= 3 && !line.includes("====================================")) {
          return "pipe";
        }
      }
      if (line.includes("\t")) {
        const parts = line.split("\t");
        if (parts.length >= 3) {
          return "tab";
        }
      }
    }
    return "auto";
  }, []);

  const validateRecord = useCallback((record) => {
    const errors = [];
    if (!record.name || record.name.trim() === "") errors.push("Missing name");
    if (!record.dob || !/^\d{4}-\d{2}-\d{2}$/.test(record.dob)) {
      errors.push("Invalid date format");
    } else {
      const date = parseDate(record.dob);
      if (!date) errors.push("Invalid date");
      else if (date < new Date("1940-01-01")) errors.push("Date before 1940");
    }
    if (!record.ssn || !/^\d{3}-\d{2}-\d{4}$/.test(record.ssn)) errors.push("Invalid SSN format");
    return { isValid: errors.length === 0, errors };
  }, [parseDate]);

  const sortFile = useCallback(async () => {
    if (!file) {
      alert("Please upload a file first");
      return;
    }

    setProcessing(true);
    setStatus("Analyzing file format...");
    setProgress(0);
    
    const processFileChunked = async (text) => {
      const lines = text.split("\n");
      const cutoff = new Date(`${filters.minYear}-01-01`);
      const maxDate = new Date(`${filters.maxYear}-12-31`);
      const seenKeys = new Set();
      const output = [];
      const stats = {
        totalRecords: 0,
        validRecords: 0,
        duplicateRecords: 0,
        invalidRecords: 0
      };
      
      const totalChunks = Math.ceil(lines.length / CHUNK_SIZE);
      let actualFormat = fileFormat;
      
      if (fileFormat === "auto") {
        const sampleLines = lines.slice(0, 20).filter(l => l.trim() && !l.includes("===================================="));
        actualFormat = detectFileFormat(sampleLines);
        setStatus(`Detected format: ${actualFormat === "pipe" ? "Pipe-separated" : "Tab-separated"}`);
      }

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const chunk = lines.slice(start, start + CHUNK_SIZE);
        
        await new Promise(resolve => {
          queueMicrotask(() => {
            for (const line of chunk) {
              if (!line.trim()) continue;
              stats.totalRecords++;
              if (line.includes("====================================")) continue;
              
              let name = "", dob = "", ssn = "";
              
              if (actualFormat === "pipe" || line.includes("|")) {
                const pipeCols = line.trim().split("|");
                if (pipeCols.length >= 3) [name, dob, ssn] = pipeCols;
              } else {
                const tabCols = line.trim().split("\t");
                if (tabCols.length >= 3) {
                  for (const col of tabCols) {
                    if (/^\d{4}-\d{2}-\d{2}$/.test(col) && !col.includes("-00")) dob = col;
                    else if (/^\d{3}-\d{2}-\d{4}$/.test(col)) ssn = col;
                  }
                  if (tabCols[1]) name = tabCols[1];
                  if (tabCols[2] && !/^\d/.test(tabCols[2])) name += " " + tabCols[2];
                  if (tabCols[3] && !/^\d/.test(tabCols[3])) name += " " + tabCols[3];
                  name = name.trim();
                }
              }
              
              const validation = validateRecord({ name, dob, ssn });
              if (!validation.isValid) {
                stats.invalidRecords++;
                continue;
              }
              
              const dobDate = parseDate(dob);
              if (!dobDate || dobDate < cutoff || dobDate > maxDate) {
                stats.invalidRecords++;
                continue;
              }
              
              const key = filters.uniqueOnly ? `${name}|${dob}|${ssn}` : `${ssn}|${dob}`;
              if (seenKeys.has(key)) {
                stats.duplicateRecords++;
                continue;
              }
              
              const { firstName, lastName, middleName } = extractFirstAndLastName(name);
              seenKeys.add(key);
              output.push({ 
                name, dob, ssn, firstName, lastName, middleName, year: dobDate.getFullYear()
              });
              stats.validRecords++;
            }
            resolve();
          });
        });

        if (chunkIndex % 5 === 0 || chunkIndex === totalChunks - 1) {
          const currentProgress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
          setProgress(currentProgress);
          setStatus(`Processing... ${currentProgress}% (${stats.validRecords} valid records found)`);
        }
      }

      setStats(stats);
      return output;
    };

    try {
      const text = await file.text();
      const output = await processFileChunked(text);

      output.sort((a, b) => {
        if (sortOrder === "last-first") {
          const lastNameCompare = a.lastName.localeCompare(b.lastName);
          if (lastNameCompare !== 0) return lastNameCompare;
          const firstNameCompare = a.firstName.localeCompare(b.firstName);
          if (firstNameCompare !== 0) return firstNameCompare;
        } else if (sortOrder === "dob") {
          const dateA = new Date(a.dob);
          const dateB = new Date(b.dob);
          if (dateA < dateB) return -1;
          if (dateA > dateB) return 1;
          const lastNameCompare = a.lastName.localeCompare(b.lastName);
          if (lastNameCompare !== 0) return lastNameCompare;
        } else {
          const firstNameCompare = a.firstName.localeCompare(b.firstName);
          if (firstNameCompare !== 0) return firstNameCompare;
          const lastNameCompare = a.lastName.localeCompare(b.lastName);
          if (lastNameCompare !== 0) return lastNameCompare;
        }
        
        const dateA = new Date(a.dob);
        const dateB = new Date(b.dob);
        if (dateA < dateB) return -1;
        if (dateA > dateB) return 1;
        return a.ssn.localeCompare(b.ssn);
      });

      setResults(output);
      setProgress(100);
      setStatus(`✅ ${output.length.toLocaleString()} records sorted successfully`);
    } catch (error) {
      setStatus(`❌ Error: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  }, [file, fileFormat, sortOrder, filters, detectFileFormat, validateRecord, parseDate, extractFirstAndLastName]);

  const generateContentWithSeparators = useCallback(() => {
    if (results.length === 0) return "";
    const contentLines = [];
    let currentFullName = "";
    results.forEach((row, index) => {
      const { firstName, lastName } = extractFirstAndLastName(row.name);
      const fullName = `${firstName} ${lastName}`;
      if (includeSeparators && fullName !== currentFullName) {
        contentLines.push(`==================================== ${fullName}`);
        currentFullName = fullName;
      }
      contentLines.push(`${row.name}|${row.dob}|${row.ssn}`);
    });
    return contentLines.join("\n");
  }, [results, extractFirstAndLastName, includeSeparators]);

  const generateContentWithoutSeparators = useCallback(() => {
    return results.map(r => `${r.name}|${r.dob}|${r.ssn}`).join("\n");
  }, [results]);

  const saveFile = useCallback(() => {
    if (results.length === 0) return;
    const content = includeSeparators ? generateContentWithSeparators() : generateContentWithoutSeparators();
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

  const resetApp = useCallback(() => {
    setFile(null);
    setFileName("");
    setProgress(0);
    setStatus("");
    setResults([]);
    setProcessing(false);
    setStats({ totalRecords: 0, validRecords: 0, duplicateRecords: 0, invalidRecords: 0 });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const f = files[0];
      if (f.name.toLowerCase().endsWith('.txt')) {
        const event = { target: { files: [f] } };
        handleFile(event);
      } else {
        alert("Please drop a .txt file");
      }
    }
  }, [handleFile]);

  const previewRows = useMemo(() => {
    if (results.length === 0) return [];
    const maxRows = isMobile ? 10 : 20;
    return results.slice(0, Math.min(maxRows, results.length));
  }, [results, isMobile]);

  const fileSizeMB = useMemo(() => {
    return file ? (file.size / (1024 * 1024)).toFixed(2) : 0;
  }, [file]);

  const yearDistribution = useMemo(() => {
    const distribution = {};
    results.forEach(row => {
      const year = row.year;
      distribution[year] = (distribution[year] || 0) + 1;
    });
    return Object.entries(distribution).sort(([a], [b]) => a - b).slice(0, 5);
  }, [results]);

  return (
    <div style={styles.page}>
      {isMobile && (
        <div style={styles.mobileOverlay}>
          <div style={styles.mobileIcon}>📱</div>
          <p style={styles.mobileText}>Mobile Mode Active</p>
        </div>
      )}
      
      <div style={styles.card}>
        <header style={styles.header}>
          <div style={styles.logo}>
            <div style={styles.logoIcon}>🚀</div>
            <div style={styles.logoText}>
              <h1 style={styles.title}>Mosort Pro</h1>
              <p style={styles.subtitle}>
                {isMobile ? "Advanced File Processor" : "Advanced Text File Processor with AI"}
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
              <div style={styles.statCard}>
                <div style={styles.statIcon}>🛡️</div>
                <div style={styles.statContent}>
                  <div style={styles.statValue}>Secure</div>
                  <div style={styles.statLabel}>Local Only</div>
                </div>
              </div>
            </div>
          )}
        </header>

        {stats.totalRecords > 0 && (
          <div style={styles.statsBanner}>
            <div style={styles.statItem}>
              <span style={styles.statItemLabel}>Total:</span>
              <span style={styles.statItemValue}>{stats.totalRecords}</span>
            </div>
            <div style={styles.statItem}>
              <span style={styles.statItemLabel}>Valid:</span>
              <span style={styles.statItemValueSuccess}>{stats.validRecords}</span>
            </div>
            <div style={styles.statItem}>
              <span style={styles.statItemLabel}>Duplicates:</span>
              <span style={styles.statItemValueWarning}>{stats.duplicateRecords}</span>
            </div>
            <div style={styles.statItem}>
              <span style={styles.statItemLabel}>Invalid:</span>
              <span style={styles.statItemValueError}>{stats.invalidRecords}</span>
            </div>
          </div>
        )}

        <div style={styles.mainContent}>
          <div style={styles.section}>
            <div style={styles.uploadCard}>
              <div style={styles.uploadHeader}>
                <h3 style={styles.cardTitle}>
                  {isMobile ? "📁 Upload File" : "File Upload"}
                </h3>
                <div style={styles.fileTypeBadge}>TXT</div>
              </div>
              
              <label htmlFor="file-upload" style={styles.uploadLabel} onDragOver={handleDragOver} onDrop={handleDrop}>
                <input ref={fileInputRef} id="file-upload" type="file" accept=".txt" onChange={handleFile} style={styles.fileInput} disabled={processing} />
                <div style={styles.uploadArea}>
                  <div style={styles.uploadIconContainer}>
                    <div style={styles.uploadIcon}>📁</div>
                    {processing && (
                      <div style={styles.uploadOverlay}>
                        <div style={styles.uploadSpinner}></div>
                      </div>
                    )}
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
                      Supports .txt files (tab or pipe separated)
                    </div>
                  )}
                </div>
              </label>
            </div>

            {/* Donation Section - Added here */}
            <div style={styles.donateCard}>
              <h3 style={styles.cardTitle}>💝 Support the Project</h3>
              <p style={styles.donateText}>Scan or copy the address to donate USDT (TRC-20)</p>
              
              <div style={styles.qrContainer}>
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${donationAddress}`}
                  alt="USDT Donation QR Code"
                  style={styles.qrCode}
                />
              </div>
              
              <div style={styles.addressContainer}>
                <code style={styles.addressCode}>{donationAddress}</code>
                <button onClick={copyToClipboard} style={styles.copyButton}>
                  📋 Copy
                </button>
              </div>
              
              {copySuccess && (
                <div style={styles.copyMessage}>
                  {copySuccess}
                </div>
              )}
              
              <p style={styles.donateNote}>
                <small>Network: Tron (TRC-20). Please double-check the address.</small>
              </p>
            </div>

            <div style={styles.settingsCard}>
              <div style={styles.settingsHeader}>
                <h3 style={styles.cardTitle}>
                  {isMobile ? "⚙️ Settings" : "Processing Settings"}
                </h3>
              </div>

              <div style={styles.settingGroup}>
                <label style={styles.settingGroupLabel}>File Format</label>
                <div style={styles.radioGroup}>
                  {["auto", "tab", "pipe"].map(format => (
                    <label key={format} style={styles.radioLabel}>
                      <input type="radio" name="format" value={format} checked={fileFormat === format} onChange={(e) => setFileFormat(e.target.value)} style={styles.radioInput} disabled={processing} />
                      <span style={styles.radioText}>
                        {format === "auto" ? "Auto-detect" : format === "tab" ? "Tab-separated" : "Pipe-separated"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={styles.settingGroup}>
                <label style={styles.settingGroupLabel}>Sort Order</label>
                <div style={styles.radioGroup}>
                  {["first-last", "last-first", "dob"].map(order => (
                    <label key={order} style={styles.radioLabel}>
                      <input type="radio" name="sortOrder" value={order} checked={sortOrder === order} onChange={(e) => setSortOrder(e.target.value)} style={styles.radioInput} disabled={processing} />
                      <span style={styles.radioText}>
                        {order === "first-last" ? "First → Last" : order === "last-first" ? "Last → First" : "Date of Birth"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={styles.settingGroup}>
                <label style={styles.settingGroupLabel}>Filters</label>
                <div style={styles.filterControls}>
                  <div style={styles.filterRow}>
                    <span style={styles.filterLabel}>Year Range:</span>
                    <div style={styles.filterInputs}>
                      <input type="number" value={filters.minYear} onChange={(e) => setFilters(prev => ({...prev, minYear: parseInt(e.target.value) || 1940}))} style={styles.yearInput} min="1900" max={filters.maxYear} disabled={processing} />
                      <span style={styles.filterSeparator}>to</span>
                      <input type="number" value={filters.maxYear} onChange={(e) => setFilters(prev => ({...prev, maxYear: parseInt(e.target.value) || new Date().getFullYear()}))} style={styles.yearInput} min={filters.minYear} max="2100" disabled={processing} />
                    </div>
                  </div>
                  <label style={styles.checkboxLabel}>
                    <input type="checkbox" checked={filters.uniqueOnly} onChange={(e) => setFilters(prev => ({...prev, uniqueOnly: e.target.checked}))} style={styles.checkboxInput} disabled={processing} />
                    <span style={styles.checkboxText}>Remove duplicate records</span>
                  </label>
                </div>
              </div>

              <div style={styles.settingGroup}>
                <label style={styles.settingGroupLabel}>Output Settings</label>
                <label style={styles.checkboxLabel}>
                  <input type="checkbox" checked={includeSeparators} onChange={(e) => setIncludeSeparators(e.target.checked)} style={styles.checkboxInput} disabled={processing} />
                  <span style={styles.checkboxText}>Add group separators</span>
                </label>
              </div>
            </div>

            <div style={styles.actionsCard}>
              <div style={styles.buttonGrid}>
                <button onClick={sortFile} disabled={!file || processing} style={{ ...styles.button, ...styles.primaryButton, ...(processing && styles.disabledButton), ...(isMobile && styles.mobileButton) }}>
                  <div style={styles.buttonContent}>
                    {processing ? (
                      <>
                        <div style={styles.spinnerContainer}><div style={styles.spinner}></div></div>
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <div style={styles.buttonIcon}>🚀</div>
                        <span>Process File</span>
                      </>
                    )}
                  </div>
                </button>

                <button onClick={resetApp} disabled={processing} style={{ ...styles.button, ...styles.secondaryButton, ...(isMobile && styles.mobileButton) }}>
                  <div style={styles.buttonContent}>
                    <div style={styles.buttonIcon}>🔄</div>
                    <span>Reset</span>
                  </div>
                </button>
              </div>

              <div style={styles.progressCard}>
                <div style={styles.progressHeader}>
                  <span style={styles.progressLabel}>Processing Progress</span>
                  <span style={styles.progressPercent}>{progress}%</span>
                </div>
                <div style={styles.progressContainer}>
                  <div style={{ ...styles.progressBar, width: `${progress}%`, background: progress === 100 ? 'linear-gradient(90deg, #10b981, #059669)' : 'linear-gradient(90deg, #667eea, #9f7aea, #667eea)', boxShadow: progress === 100 ? '0 0 20px rgba(16, 185, 129, 0.5)' : '0 0 20px rgba(102, 126, 234, 0.3)' }} />
                </div>
                <p style={styles.statusMessage}>
                  {status || (isMobile ? "Upload file to start" : "Upload a file to begin processing")}
                </p>
              </div>

              {results.length > 0 && (
                <button onClick={saveFile} style={{ ...styles.button, ...styles.successButton, ...(isMobile && styles.mobileButton), marginTop: '16px' }}>
                  <div style={styles.buttonContent}>
                    <div style={styles.buttonIcon}>💾</div>
                    <div style={styles.saveButtonText}>
                      <div style={styles.saveButtonMain}>
                        {isMobile ? "Download" : "Download Sorted File"}
                      </div>
                      {!isMobile && (
                        <div style={styles.saveButtonSub}>
                          {results.length.toLocaleString()} records • {includeSeparators ? "With separators" : "No separators"}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              )}
            </div>
          </div>

          <div style={styles.section}>
            <div style={styles.resultsCard}>
              <div style={styles.resultsHeader}>
                <div style={styles.resultsTitle}>
                  <h3 style={styles.cardTitle}>
                    {results.length > 0 ? '📊 Results Preview' : '📋 Output Preview'}
                  </h3>
                  {results.length > 0 && (
                    <div style={styles.resultsStats}>
                      <div style={styles.resultsStat}>
                        <div style={styles.resultsStatValue}>{results.length}</div>
                        <div style={styles.resultsStatLabel}>Records</div>
                      </div>
                      {!isMobile && (
                        <>
                          <div style={styles.resultsStat}>
                            <div style={styles.resultsStatValue}>
                              {new Set(results.map(r => `${r.firstName} ${r.lastName}`)).size}
                            </div>
                            <div style={styles.resultsStatLabel}>Unique Names</div>
                          </div>
                          <div style={styles.resultsStat}>
                            <div style={styles.resultsStatValue}>
                              {new Set(results.map(r => r.year)).size}
                            </div>
                            <div style={styles.resultsStatLabel}>Years</div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {yearDistribution.length > 0 && !isMobile && (
                <div style={styles.distributionCard}>
                  <div style={styles.distributionHeader}>
                    <span style={styles.distributionTitle}>Top Years</span>
                  </div>
                  <div style={styles.distributionBars}>
                    {yearDistribution.map(([year, count]) => {
                      const maxCount = Math.max(...yearDistribution.map(([, c]) => c));
                      const width = (count / maxCount) * 100;
                      return (
                        <div key={year} style={styles.distributionItem}>
                          <div style={styles.distributionLabel}>{year}</div>
                          <div style={styles.distributionBarContainer}>
                            <div style={{ ...styles.distributionBar, width: `${width}%`, background: `linear-gradient(90deg, #667eea, ${width > 70 ? '#9f7aea' : '#818cf8'})` }} />
                          </div>
                          <div style={styles.distributionCount}>{count}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {results.length > 0 ? (
                <div style={styles.tableContainer}>
                  {!isMobile ? (
                    <>
                      <div style={styles.tableHeader}>
                        <div style={styles.tableHeaderCell}>#</div>
                        <div style={styles.tableHeaderCell}>Full Name</div>
                        <div style={styles.tableHeaderCell}>DOB</div>
                        <div style={styles.tableHeaderCell}>SSN</div>
                      </div>
                      
                      <div style={styles.tableBody}>
                        {previewRows.map((item, index) => (
                          <div key={index} style={styles.dataRow}>
                            <div style={styles.dataCell}>
                              <div style={styles.indexBadge}>{index + 1}</div>
                            </div>
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
                                  {item.middleName && (
                                    <span style={styles.nameDetail}>
                                      <span style={styles.nameDetailLabel}>Middle:</span>
                                      <span style={styles.nameDetailValue}>{item.middleName}</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div style={styles.dataCell}>
                              <div style={styles.dobCell}>
                                {item.dob}
                                <div style={styles.yearBadge}>{item.year}</div>
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
                              <span style={styles.mobileDetailValue}>{item.dob} ({item.year})</span>
                            </div>
                            <div style={styles.mobileDetail}>
                              <span style={styles.mobileDetailLabel}>SSN:</span>
                              <span style={styles.mobileDetailValue}>{item.ssn}</span>
                            </div>
                            <div style={styles.mobileNameBreakdown}>
                              <span style={styles.mobileNamePart}>{item.firstName}</span>
                              {item.middleName && <span style={styles.mobileNamePart}>{item.middleName}</span>}
                              <span style={styles.mobileNamePart}>{item.lastName}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {results.length > previewRows.length && (
                    <div style={styles.tableFooter}>
                      <div style={styles.tableFooterContent}>
                        <span>Showing {previewRows.length} of {results.length.toLocaleString()} records</span>
                        <span style={styles.tableFooterNote}>
                          {sortOrder === "first-last" ? "Sorted by First Name → Last Name" : sortOrder === "last-first" ? "Sorted by Last Name → First Name" : "Sorted by Date of Birth"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={styles.emptyState}>
                  <div style={styles.emptyStateIcon}>📊</div>
                  <h4 style={styles.emptyStateTitle}>No Data Processed</h4>
                  <p style={styles.emptyStateText}>
                    {isMobile ? "Upload and process a file to see results" : "Upload a .txt file and start processing to see the results here"}
                  </p>
                  <div style={styles.emptyStateTips}>
                    <div style={styles.tipItem}>
                      <span style={styles.tipIcon}>💡</span>
                      <span style={styles.tipText}>Supports both tab and pipe separated formats</span>
                    </div>
                    <div style={styles.tipItem}>
                      <span style={styles.tipIcon}>⚙️</span>
                      <span style={styles.tipText}>Adjust settings for custom sorting and filtering</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {results.length > 0 && !isMobile && (
              <div style={styles.quickActions}>
                <button onClick={() => navigator.clipboard.writeText(includeSeparators ? generateContentWithSeparators() : generateContentWithoutSeparators())} style={styles.quickActionButton}>
                  <div style={styles.quickActionIcon}>📋</div>
                  <span>Copy to Clipboard</span>
                </button>
                <button onClick={() => window.print()} style={styles.quickActionButton}>
                  <div style={styles.quickActionIcon}>🖨️</div>
                  <span>Print Preview</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <footer style={styles.footer}>
          <div style={styles.footerContent}>
            <span style={styles.footerText}>
              Mosort Pro v2.0 • Advanced File Processor • {isMobile ? "Mobile" : "Desktop"} Mode
            </span>
            <div style={styles.footerStats}>
              {processing && (
                <span style={styles.footerStat}>
                  Processing: {progress}% • Memory: {(performance.memory?.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB
                </span>
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
    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    padding: "16px",
    position: "relative",
    overflowX: "hidden",
    '@media (max-width: 768px)': { padding: "12px" }
  },
  
  mobileOverlay: {
    position: 'fixed', top: '10px', right: '10px', background: 'rgba(102, 126, 234, 0.2)',
    backdropFilter: 'blur(10px)', borderRadius: '20px', padding: '8px 16px',
    display: 'flex', alignItems: 'center', gap: '8px', zIndex: 1000,
    border: '1px solid rgba(102, 126, 234, 0.3)', animation: 'slideIn 0.3s ease'
  },
  
  mobileIcon: { fontSize: '20px', animation: 'bounce 2s infinite' },
  mobileText: { fontSize: '12px', color: '#e2e8f0', fontWeight: '500' },
  
  statsBanner: {
    display: 'flex', justifyContent: 'space-around', background: 'rgba(30, 41, 59, 0.8)',
    borderRadius: '12px', padding: '12px', marginBottom: '20px',
    border: '1px solid rgba(255, 255, 255, 0.05)', flexWrap: 'wrap', gap: '12px',
    '@media (max-width: 768px)': { padding: '8px', gap: '8px' }
  },
  
  statItem: { display: 'flex', alignItems: 'center', gap: '6px' },
  statItemLabel: { fontSize: '12px', color: '#94a3b8', fontWeight: '500', '@media (max-width: 768px)': { fontSize: '11px' } },
  statItemValue: { fontSize: '14px', fontWeight: '700', color: '#ffffff', '@media (max-width: 768px)': { fontSize: '13px' } },
  statItemValueSuccess: { fontSize: '14px', fontWeight: '700', color: '#10b981', '@media (max-width: 768px)': { fontSize: '13px' } },
  statItemValueWarning: { fontSize: '14px', fontWeight: '700', color: '#f59e0b', '@media (max-width: 768px)': { fontSize: '13px' } },
  statItemValueError: { fontSize: '14px', fontWeight: '700', color: '#ef4444', '@media (max-width: 768px)': { fontSize: '13px' } },
  
  card: {
    background: "rgba(30, 41, 59, 0.9)", backdropFilter: "blur(10px)", borderRadius: "20px",
    padding: "24px", width: "100%", maxWidth: "1600px", margin: "0 auto",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)", border: "1px solid rgba(255, 255, 255, 0.1)",
    animation: "fadeIn 0.5s ease", '@media (max-width: 768px)': { padding: "16px", borderRadius: "16px" }
  },
  
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginBottom: "24px", paddingBottom: "20px", borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
    '@media (max-width: 768px)': { flexDirection: 'column', gap: '16px', alignItems: 'flex-start', marginBottom: '20px', paddingBottom: '16px' }
  },
  
  logo: { display: "flex", alignItems: "center", gap: "16px", '@media (max-width: 768px)': { gap: '12px' } },
  
  logoIcon: {
    fontSize: "40px", background: "linear-gradient(135deg, #667eea, #9f7aea)", borderRadius: "12px",
    width: "52px", height: "52px", display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 4px 20px rgba(102, 126, 234, 0.3)", animation: "pulse 2s infinite",
    '@media (max-width: 768px)': { width: '44px', height: '44px', fontSize: '32px' }
  },
  
  logoText: { display: "flex", flexDirection: "column", '@media (max-width: 768px)': { flex: 1 } },
  title: {
    fontSize: "28px", fontWeight: "800", background: "linear-gradient(135deg, #ffffff, #cbd5e1)",
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: "0 0 4px 0",
    letterSpacing: "-0.5px", '@media (max-width: 768px)': { fontSize: '24px' }
  },
  
  subtitle: { fontSize: "14px", color: "#94a3b8", margin: 0, fontWeight: "500", '@media (max-width: 768px)': { fontSize: '12px' } },
  headerStats: { display: "flex", gap: "12px", '@media (max-width: 768px)': { width: '100%', justifyContent: 'center' } },
  
  statCard: {
    display: "flex", alignItems: "center", gap: "10px", background: "rgba(30, 41, 59, 0.6)",
    padding: "10px 16px", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.05)",
    transition: "all 0.3s ease", ':hover': { transform: "translateY(-2px)", borderColor: "rgba(102, 126, 234, 0.3)" },
    '@media (max-width: 768px)': { padding: '8px 12px' }
  },
  
  statIcon: { fontSize: "18px", '@media (max-width: 768px)': { fontSize: '16px' } },
  statContent: { display: "flex", flexDirection: "column" },
  statValue: { fontSize: "14px", fontWeight: "700", color: "#ffffff", '@media (max-width: 768px)': { fontSize: '12px' } },
  statLabel: { fontSize: "11px", color: "#94a3b8", '@media (max-width: 768px)': { fontSize: '10px' } },
  
  mainContent: {
    display: "flex", flexDirection: "column", gap: "24px", marginBottom: "32px",
    '@media (min-width: 769px)': { display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '32px' }
  },
  
  section: { display: "flex", flexDirection: "column", gap: "20px" },
  
  uploadCard: {
    background: "rgba(30, 41, 59, 0.6)", borderRadius: "16px", padding: "20px",
    border: "1px solid rgba(255, 255, 255, 0.05)", boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
    transition: "all 0.3s ease", ':hover': { borderColor: "rgba(102, 126, 234, 0.2)", boxShadow: "0 12px 40px rgba(0, 0, 0, 0.3)" },
    '@media (max-width: 768px)': { padding: '16px' }
  },
  
  uploadHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" },
  cardTitle: { fontSize: "16px", fontWeight: "700", color: "#ffffff", margin: 0, '@media (max-width: 768px)': { fontSize: '15px' } },
  
  fileTypeBadge: {
    background: "rgba(102, 126, 234, 0.2)", color: "#667eea", padding: "4px 10px",
    borderRadius: "16px", fontSize: "11px", fontWeight: "600", border: "1px solid rgba(102, 126, 234, 0.3)"
  },
  
  uploadLabel: { cursor: "pointer", display: "block" },
  fileInput: { display: "none" },
  
  uploadArea: {
    border: "2px dashed rgba(102, 126, 234, 0.3)", borderRadius: "12px", padding: "32px 20px",
    background: "rgba(15, 23, 42, 0.4)", transition: "all 0.3s ease", textAlign: "center", position: "relative",
    ':hover': { borderColor: "#667eea", background: "rgba(15, 23, 42, 0.6)", transform: "translateY(-2px)" },
    '@media (max-width: 768px)': { padding: '24px 16px' }
  },
  
  uploadIconContainer: { marginBottom: "12px", position: "relative" },
  uploadIcon: { fontSize: "48px", color: "#667eea", transition: "all 0.3s ease", '@media (max-width: 768px)': { fontSize: '40px' } },
  
  uploadOverlay: {
    position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
    background: "rgba(15, 23, 42, 0.8)", width: "60px", height: "60px", borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center"
  },
  
  uploadSpinner: {
    width: "24px", height: "24px", border: "2px solid rgba(102, 126, 234, 0.3)",
    borderTop: "2px solid #667eea", borderRadius: "50%", animation: "spin 1s linear infinite"
  },
  
  uploadText: {
    fontSize: "15px", color: "#e2e8f0", margin: "0 0 12px 0", fontWeight: "500",
    '@media (max-width: 768px)': { fontSize: '14px' }
  },
  
  fileNameActive: {
    color: '#667eea', fontWeight: '600', wordBreak: 'break-word',
    display: 'inline-block', padding: '4px 8px', background: 'rgba(102, 126, 234, 0.1)', borderRadius: '6px'
  },
  
  fileInfo: {
    background: "rgba(30, 41, 59, 0.8)", borderRadius: "10px", padding: "12px",
    marginBottom: "12px", border: "1px solid rgba(255, 255, 255, 0.05)",
    '@media (max-width: 768px)': { padding: '10px' }
  },
  
  fileInfoRow: { display: "flex", justifyContent: "space-between", marginBottom: "6px", ':last-child': { marginBottom: 0 } },
  fileInfoLabel: { fontSize: "12px", color: "#94a3b8", '@media (max-width: 768px)': { fontSize: '11px' } },
  fileInfoValue: { fontSize: "12px", color: "#ffffff", fontWeight: "500", '@media (max-width: 768px)': { fontSize: '11px' } },
  fileInfoValueReady: { fontSize: "12px", color: "#48bb78", fontWeight: "600", '@media (max-width: 768px)': { fontSize: '11px' } },
  
  uploadHint: {
    fontSize: "11px", color: "#64748b", fontStyle: "italic", marginTop: "8px",
    '@media (max-width: 768px)': { fontSize: '10px' }
  },
  
  // Donation Card Styles - Added these
  donateCard: {
    background: "rgba(30, 41, 59, 0.6)",
    borderRadius: "16px",
    padding: "20px",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    marginTop: "20px",
    textAlign: "center",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)"
  },
  
  donateText: {
    fontSize: "14px",
    color: "#cbd5e1",
    marginBottom: "16px"
  },
  
  qrContainer: {
    margin: "16px 0",
    display: "flex",
    justifyContent: "center"
  },
  
  qrCode: {
    width: "150px",
    height: "150px",
    borderRadius: "8px",
    border: "2px solid rgba(102, 126, 234, 0.3)"
  },
  
  addressContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    margin: "16px 0",
    flexWrap: "wrap",
    background: "rgba(15, 23, 42, 0.4)",
    padding: "12px",
    borderRadius: "8px"
  },
  
  addressCode: {
    fontSize: "12px",
    color: "#9f7aea",
    wordBreak: "break-all",
    fontFamily: "monospace"
  },
  
  copyButton: {
    background: "linear-gradient(135deg, #667eea, #9f7aea)",
    color: "white",
    border: "none",
    padding: "8px 16px",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "600",
    transition: "all 0.3s ease",
    ':hover': {
      transform: "translateY(-2px)",
      boxShadow: "0 4px 12px rgba(102, 126, 234, 0.4)"
    }
  },
  
  copyMessage: {
    marginTop: "10px",
    fontSize: "13px",
    color: "#48bb78",
    fontWeight: "500"
  },
  
  donateNote: {
    fontSize: "11px",
    color: "#94a3b8",
    marginTop: "16px",
    fontStyle: "italic"
  },
  
  // Rest of the styles remain the same
  settingsCard: {
    background: "rgba(30, 41, 59, 0.6)", borderRadius: "16px", padding: "20px",
    border: "1px solid rgba(255, 255, 255, 0.05)", boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)",
    '@media (max-width: 768px)': { padding: '16px' }
  },
  
  settingsHeader: { marginBottom: "20px" },
  settingGroup: { marginBottom: "20px", ':last-child': { marginBottom: 0 } },
  
  settingGroupLabel: {
    display: "block", fontSize: "13px", fontWeight: "600", color: "#e2e8f0",
    marginBottom: "10px", '@media (max-width: 768px)': { fontSize: '12px' }
  },
  
  radioGroup: { display: "flex", flexDirection: "column", gap: "8px" },
  
  radioLabel: {
    display: "flex", alignItems: "center", gap: "8px", cursor: "pointer",
    padding: "8px 12px", borderRadius: "8px", transition: "all 0.2s ease",
    ':hover': { background: "rgba(255, 255, 255, 0.05)" }
  },
  
  radioInput: { margin: 0, width: "16px", height: "16px", accentColor: "#667eea" },
  radioText: { fontSize: "13px", color: "#cbd5e1", '@media (max-width: 768px)': { fontSize: '12px' } },
  
  filterControls: { display: "flex", flexDirection: "column", gap: "12px" },
  filterRow: { display: "flex", alignItems: "center", gap: "12px" },
  
  filterLabel: {
    fontSize: "13px", color: "#94a3b8", minWidth: "80px",
    '@media (max-width: 768px)': { fontSize: '12px', minWidth: '70px' }
  },
  
  filterInputs: { display: "flex", alignItems: "center", gap: "8px" },
  
  yearInput: {
    background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "6px", padding: "6px 10px", color: "#ffffff", fontSize: "13px",
    width: "70px", textAlign: "center", outline: "none", transition: "all 0.2s ease",
    ':focus': { borderColor: "#667eea", boxShadow: "0 0 0 2px rgba(102, 126, 234, 0.2)" },
    '@media (max-width: 768px)': { width: '60px', fontSize: '12px' }
  },
  
  filterSeparator: { fontSize: "12px", color: "#94a3b8" },
  
  checkboxLabel: {
    display: "flex", alignItems: "center", gap: "8px", cursor: "pointer",
    padding: "8px 12px", borderRadius: "8px", transition: "all 0.2s ease",
    ':hover': { background: "rgba(255, 255, 255, 0.05)" }
  },
  
  checkboxInput: { margin: 0, width: "16px", height: "16px", accentColor: "#667eea" },
  checkboxText: { fontSize: "13px", color: "#cbd5e1", '@media (max-width: 768px)': { fontSize: '12px' } },
  
  actionsCard: { display: "flex", flexDirection: "column", gap: "16px" },
  
  buttonGrid: {
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px",
    '@media (max-width: 768px)': { gridTemplateColumns: '1fr' }
  },
  
  button: {
    padding: "16px 20px", borderRadius: "12px", border: "none", fontSize: "15px",
    fontWeight: "600", cursor: "pointer", transition: "all 0.3s ease",
    display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
    width: "100%", position: "relative", overflow: "hidden",
    ':before': {
      content: '""', position: 'absolute', top: '50%', left: '50%', width: '0',
      height: '0', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.1)',
      transform: 'translate(-50%, -50%)', transition: 'width 0.6s, height 0.6s'
    },
    ':hover:before': { width: '300px', height: '300px' },
    ':active': { transform: "scale(0.98)" },
    '@media (max-width: 768px)': { padding: '14px 16px', fontSize: '14px' }
  },
  
  mobileButton: { padding: '14px', fontSize: '14px', gap: '8px' },
  buttonContent: { display: "flex", alignItems: "center", gap: "10px", position: "relative", zIndex: 1, '@media (max-width: 768px)': { gap: '8px' } },
  
  primaryButton: {
    background: "linear-gradient(135deg, #667eea 0%, #9f7aea 100%)", color: "white",
    boxShadow: "0 4px 20px rgba(102, 126, 234, 0.4)", ':hover': { transform: "translateY(-2px)", boxShadow: "0 8px 30px rgba(102, 126, 234, 0.5)" }
  },
  
  secondaryButton: {
    background: "rgba(255, 255, 255, 0.05)", color: "#cbd5e1",
    border: "1px solid rgba(255, 255, 255, 0.1)", ':hover': {
      background: "rgba(255, 255, 255, 0.1)", borderColor: "rgba(255, 255, 255, 0.2)", transform: "translateY(-2px)"
    }
  },
  
  successButton: {
    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)", color: "white",
    boxShadow: "0 4px 20px rgba(16, 185, 129, 0.4)", ':hover': { transform: "translateY(-2px)", boxShadow: "0 8px 30px rgba(16, 185, 129, 0.5)" }
  },
  
  disabledButton: {
    opacity: 0.6, cursor: "not-allowed", ':hover': { transform: "none", boxShadow: "0 4px 20px rgba(102, 126, 234, 0.4)" }
  },
  
  buttonIcon: { fontSize: "18px", '@media (max-width: 768px)': { fontSize: '16px' } },
  spinnerContainer: { display: "flex", alignItems: "center", justifyContent: "center" },
  
  spinner: {
    width: "18px", height: "18px", border: "2px solid rgba(255,255,255,0.3)",
    borderTop: "2px solid white", borderRadius: "50%", animation: "spin 1s linear infinite",
    '@media (max-width: 768px)': { width: '16px', height: '16px' }
  },
  
  saveButtonText: { display: "flex", flexDirection: "column", alignItems: "flex-start", textAlign: "left" },
  saveButtonMain: { fontSize: "15px", fontWeight: "600", '@media (max-width: 768px)': { fontSize: '14px' } },
  
  saveButtonSub: {
    fontSize: "11px", opacity: 0.9, fontWeight: "400", marginTop: "2px",
    '@media (max-width: 768px)': { fontSize: '10px' }
  },
  
  progressCard: {
    background: "rgba(30, 41, 59, 0.6)", borderRadius: "12px", padding: "16px",
    border: "1px solid rgba(255, 255, 255, 0.05)", boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)"
  },
  
  progressHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" },
  progressLabel: { fontSize: "13px", color: "#e2e8f0", fontWeight: "500", '@media (max-width: 768px)': { fontSize: '12px' } },
  
  progressPercent: {
    fontSize: "16px", fontWeight: "700", background: "linear-gradient(135deg, #667eea, #9f7aea)",
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", '@media (max-width: 768px)': { fontSize: '15px' }
  },
  
  progressContainer: {
    height: "8px", background: "rgba(255, 255, 255, 0.05)", borderRadius: "4px",
    overflow: "hidden", marginBottom: "12px", position: "relative"
  },
  
  progressBar: {
    height: "100%", borderRadius: "4px", transition: "width 0.3s ease, box-shadow 0.3s ease",
    position: "relative", overflow: "hidden",
    ':after': {
      content: '""', position: 'absolute', top: '0', left: '0', right: '0', bottom: '0',
      backgroundImage: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent)',
      animation: 'shimmer 2s infinite'
    }
  },
  
  statusMessage: {
    fontSize: "12px", color: "#94a3b8", margin: 0, textAlign: "center",
    minHeight: "18px", lineHeight: "1.4", '@media (max-width: 768px)': { fontSize: '11px' }
  },
  
  resultsCard: {
    background: "rgba(30, 41, 59, 0.6)", borderRadius: "16px", padding: "20px",
    border: "1px solid rgba(255, 255, 255, 0.05)", boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
    height: "100%", display: "flex", flexDirection: "column", minHeight: "500px",
    '@media (max-width: 768px)': { padding: '16px', minHeight: '400px' }
  },
  
  resultsHeader: { marginBottom: "20px" },
  
  resultsTitle: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginBottom: "16px", '@media (max-width: 768px)': { flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }
  },
  
  resultsStats: {
    display: "flex", gap: "20px",
    '@media (max-width: 768px)': { width: '100%', justifyContent: 'space-between', gap: '12px' }
  },
  
  resultsStat: { textAlign: "center", '@media (max-width: 768px)': { textAlign: 'left' } },
  
  resultsStatValue: {
    fontSize: "22px", fontWeight: "800", background: "linear-gradient(135deg, #667eea, #9f7aea)",
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 1,
    '@media (max-width: 768px)': { fontSize: '20px' }
  },
  
  resultsStatLabel: {
    fontSize: "11px", color: "#94a3b8", marginTop: "4px",
    '@media (max-width: 768px)': { fontSize: '10px' }
  },
  
  distributionCard: {
    background: "rgba(30, 41, 59, 0.8)", borderRadius: "12px", padding: "16px",
    marginBottom: "20px", border: "1px solid rgba(255, 255, 255, 0.05)"
  },
  
  distributionHeader: { marginBottom: "12px" },
  distributionTitle: { fontSize: "13px", fontWeight: "600", color: "#e2e8f0" },
  distributionBars: { display: "flex", flexDirection: "column", gap: "8px" },
  distributionItem: { display: "flex", alignItems: "center", gap: "12px" },
  distributionLabel: { fontSize: "11px", color: "#94a3b8", minWidth: "40px", fontWeight: "500" },
  
  distributionBarContainer: {
    flex: 1, height: "8px", background: "rgba(255, 255, 255, 0.05)",
    borderRadius: "4px", overflow: "hidden"
  },
  
  distributionBar: { height: "100%", borderRadius: "4px", transition: "width 1s ease" },
  distributionCount: { fontSize: "11px", color: "#cbd5e1", fontWeight: "600", minWidth: "24px", textAlign: "right" },
  
  tableContainer: {
    flex: 1, overflow: "hidden", borderRadius: "12px",
    border: "1px solid rgba(255, 255, 255, 0.05)", background: "rgba(15, 23, 42, 0.4)",
    display: "flex", flexDirection: "column"
  },
  
  tableHeader: {
    display: "grid", gridTemplateColumns: "60px 1fr 120px 140px",
    background: "rgba(30, 41, 59, 0.9)", padding: "12px 16px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.05)", position: "sticky",
    top: 0, zIndex: 10, backdropFilter: "blur(10px)",
    '@media (max-width: 1024px)': { gridTemplateColumns: '50px 1fr 100px 120px' }
  },
  
  tableHeaderCell: {
    fontSize: "12px", fontWeight: "600", color: "#94a3b8",
    textTransform: "uppercase", letterSpacing: "0.5px",
    '@media (max-width: 1024px)': { fontSize: '11px' }
  },
  
  tableBody: { flex: 1, overflowY: "auto", maxHeight: "400px" },
  
  dataRow: {
    display: "grid", gridTemplateColumns: "60px 1fr 120px 140px", padding: "12px 16px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.03)", transition: "all 0.2s ease",
    ':hover': { background: "rgba(255, 255, 255, 0.02)", transform: "translateX(4px)" },
    ':nth-child(odd)': { background: "rgba(255, 255, 255, 0.01)" },
    '@media (max-width: 1024px)': { gridTemplateColumns: '50px 1fr 100px 120px', padding: '10px 12px' }
  },
  
  dataCell: { display: "flex", alignItems: "center" },
  
  indexBadge: {
    background: "rgba(102, 126, 234, 0.1)", color: "#667eea", width: "28px",
    height: "28px", borderRadius: "6px", display: "flex", alignItems: "center",
    justifyContent: "center", fontSize: "12px", fontWeight: "700"
  },
  
  nameCell: { display: "flex", flexDirection: "column", gap: "6px" },
  
  namePrimary: {
    fontSize: "13px", color: "#ffffff", fontWeight: "600", lineHeight: "1.3",
    wordBreak: "break-word", '@media (max-width: 1024px)': { fontSize: '12px' }
  },
  
  nameDetails: { display: "flex", flexWrap: "wrap", gap: "8px", fontSize: "10px" },
  
  nameDetail: {
    display: "flex", alignItems: "center", gap: "4px",
    background: "rgba(255, 255, 255, 0.05)", padding: "2px 6px", borderRadius: "4px"
  },
  
  nameDetailLabel: {
    color: "#94a3b8", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.3px"
  },
  
  nameDetailValue: { color: "#cbd5e1", fontWeight: "500", fontSize: "10px" },
  
  dobCell: {
    fontSize: "12px", color: "#cbd5e1", fontWeight: "500",
    display: "flex", flexDirection: "column", gap: "4px",
    '@media (max-width: 1024px)': { fontSize: '11px' }
  },
  
  yearBadge: {
    background: "rgba(16, 185, 129, 0.1)", color: "#10b981", fontSize: "10px",
    padding: "2px 6px", borderRadius: "4px", display: "inline-block", width: "fit-content"
  },
  
  ssnCell: {
    fontSize: "12px", color: "#cbd5e1", fontWeight: "500", fontFamily: "monospace",
    letterSpacing: "0.5px", '@media (max-width: 1024px)': { fontSize: '11px' }
  },
  
  mobileList: { flex: 1, overflowY: "auto", padding: "8px" },
  
  mobileCard: {
    background: "rgba(30, 41, 59, 0.6)", borderRadius: "10px", padding: "12px",
    marginBottom: "8px", border: "1px solid rgba(255, 255, 255, 0.05)",
    transition: "all 0.2s ease", ':active': { transform: "scale(0.98)" }
  },
  
  mobileCardHeader: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" },
  
  mobileCardNumber: {
    background: "linear-gradient(135deg, #667eea, #9f7aea)", color: "white",
    width: "28px", height: "28px", borderRadius: "6px", display: "flex",
    alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "700"
  },
  
  mobileCardTitle: {
    fontSize: "14px", color: "#ffffff", fontWeight: "600",
    flex: 1, wordBreak: "break-word"
  },
  
  mobileCardDetails: { display: "flex", flexDirection: "column", gap: "6px" },
  
  mobileDetail: { display: "flex", gap: "8px", fontSize: "12px" },
  mobileDetailLabel: { color: "#94a3b8", minWidth: "40px" },
  mobileDetailValue: { color: "#ffffff", fontWeight: "500", wordBreak: "break-all" },
  
  mobileNameBreakdown: {
    display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px",
    paddingTop: "8px", borderTop: "1px solid rgba(255, 255, 255, 0.05)"
  },
  
  mobileNamePart: {
    background: "rgba(102, 126, 234, 0.1)", color: "#cbd5e1",
    fontSize: "10px", padding: "2px 8px", borderRadius: "4px"
  },
  
  tableFooter: {
    padding: "12px 16px", background: "rgba(30, 41, 59, 0.9)",
    borderTop: "1px solid rgba(255, 255, 255, 0.05)",
    '@media (max-width: 768px)': { padding: '10px 12px' }
  },
  
  tableFooterContent: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    '@media (max-width: 768px)': { flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }
  },
  
  tableFooterNote: {
    fontSize: "10px", color: "#64748b", fontStyle: "italic",
    '@media (max-width: 768px)': { fontSize: '9px' }
  },
  
  emptyState: {
    flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", padding: "40px 20px", textAlign: "center"
  },
  
  emptyStateIcon: {
    fontSize: "64px", marginBottom: "20px", opacity: 0.3,
    animation: "float 3s ease-in-out infinite", '@media (max-width: 768px)': { fontSize: '48px' }
  },
  
  emptyStateTitle: {
    fontSize: "20px", color: "#ffffff", margin: "0 0 12px 0", fontWeight: "600",
    '@media (max-width: 768px)': { fontSize: '18px' }
  },
  
  emptyStateText: {
    fontSize: "14px", color: "#94a3b8", maxWidth: "400px", lineHeight: "1.5",
    marginBottom: "24px", '@media (max-width: 768px)': { fontSize: '13px' }
  },
  
  emptyStateTips: { display: "flex", flexDirection: "column", gap: "12px", maxWidth: "400px", width: "100%" },
  
  tipItem: {
    display: "flex", alignItems: "center", gap: "10px",
    background: "rgba(255, 255, 255, 0.05)", padding: "12px", borderRadius: "8px", textAlign: "left"
  },
  
  tipIcon: { fontSize: "16px", color: "#667eea", flexShrink: 0 },
  tipText: { fontSize: "12px", color: "#cbd5e1", lineHeight: "1.4" },
  
  quickActions: { display: "flex", gap: "12px", marginTop: "16px" },
  
  quickActionButton: {
    flex: 1, background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255, 255, 255, 0.1)",
    color: "#cbd5e1", padding: "10px 16px", borderRadius: "8px", fontSize: "13px",
    fontWeight: "500", cursor: "pointer", transition: "all 0.2s ease",
    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
    ':hover': { background: "rgba(255, 255, 255, 0.1)", transform: "translateY(-2px)" }
  },
  
  quickActionIcon: { fontSize: "14px" },
  
  footer: { marginTop: "32px", paddingTop: "20px", borderTop: "1px solid rgba(255, 255, 255, 0.1)" },
  
  footerContent: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    '@media (max-width: 768px)': { flexDirection: 'column', gap: '8px', textAlign: 'center' }
  },
  
  footerText: { fontSize: "12px", color: "#64748b", '@media (max-width: 768px)': { fontSize: '11px' } },
  
  footerStats: { fontSize: "11px", color: "#94a3b8", '@media (max-width: 768px)': { fontSize: '10px' } },
  
  footerStat: { display: "inline-block", background: "rgba(255, 255, 255, 0.05)", padding: "4px 8px", borderRadius: "4px" }
};

// Add global styles with enhanced animations
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
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  @keyframes slideIn {
    from { transform: translateX(100px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  
  @keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-5px); }
  }
  
  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }
  
  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
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
    transition: all 0.3s ease;
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
    
    body {
      background: white !important;
      color: black !important;
    }
    
    .card {
      box-shadow: none !important;
      border: 1px solid #ddd !important;
    }
  }
  
  /* Selection styles */
  ::selection {
    background: rgba(102, 126, 234, 0.3);
    color: white;
  }
  
  /* Focus styles */
  :focus-visible {
    outline: 2px solid #667eea;
    outline-offset: 2px;
  }
  
  /* Loading skeleton animation */
  @keyframes loading {
    0% { background-position: -200px 0; }
    100% { background-position: calc(200px + 100%) 0; }
  }
  
  .loading {
    background: linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 75%);
    background-size: 200px 100%;
    animation: loading 1.5s infinite;
  }
`;
document.head.appendChild(globalStyles);