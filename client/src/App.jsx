import React, { useState, useEffect, useRef, useCallback } from "react";
import { applyProperNameHandling } from "./utils/names";
// Default empty form template for passport/insurance fields
const EMPTY_FORM = {
  docType: "PASSPORT",
  passportNo: "",
  issuingCountry: "",
  nationality: "",
  sex: "",
  issueDate: "",
  doe: "",
  dob: "",
  placeOfIssue: "",
  placeOfBirth: "",

  address: "",
  fatherName: "",
  motherName: "",
  spouseName: "",
  oldPassportNo: "",
  fileNo: "",
  firstName: "",
  lastName: "",
  memberName: ""
};

/** Strip short (≤3-char) trailing OCR-garbage tokens from family member names.
 *  e.g. "Dinesh Kumar Agarwal Aie" → "Dinesh Kumar Agarwal"
 *       "Asha Agarwal Tis"         → "Asha Agarwal"  */
function cleanRelativeName(s) {
  if (!s) return s;
  const words = s.trim().split(/\s+/);
  while (words.length > 2) {
    if (words[words.length - 1].length <= 3) words.pop();
    else break;
  }
  return words.join(' ');
}

// Fields auto-uppercased as user types
const UPPERCASE_FIELDS = new Set([
  "passportNo", "issuingCountry", "nationality", "sex", "oldPassportNo", "fileNo"
]);
// Fields auto-Title-Cased as user types
const TITLECASE_FIELDS = new Set([
  "firstName", "lastName", "fatherName", "motherName", "spouseName",
  "placeOfIssue", "placeOfBirth", "memberName", "address"
]);
const toTitleCase = s => String(s).replace(/\b([a-z])/g, c => c.toUpperCase());

const API_BASE = "http://localhost:5058/api";

 
const LoginPage = ({ onLogin }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isHovered, setIsHovered] = useState(false);

  const handleLogin = (e) => {
    e.preventDefault();
    if (username === "admin" && password === "admin") {
      onLogin();
    } else {
      alert("Invalid credentials. Please use correct username and password.");
    }
  };

  return (
    <>
      <style>{`
          .login-layout { min-height: 100vh; display: flex; background-color: #ffffff; font-family: 'Inter', sans-serif; overflow: hidden; }
          .login-left-pane { flex: 1; position: relative; display: flex; flex-direction: column; justify-content: space-between; padding: 60px; background: url('/login-bg.png') center/cover no-repeat; }
          .login-right-pane { width: 100%; max-width: 560px; display: flex; align-items: center; justify-content: center; background: #ffffff; position: relative; }
          .login-form-box { width: 100%; max-width: 400px; padding: 40px; }
          @media (max-width: 800px) {
            .login-left-pane { display: none !important; }
            .login-right-pane { max-width: 100% !important; }
            .login-form-box { padding: 32px; }
          }
        `}</style>
      <div className="login-layout">
        {/* Left Pane - Image`x */}
        <div className="login-left-pane">
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "linear-gradient(to bottom, rgba(15, 23, 42, 0.4), rgba(15, 23, 42, 0.8))" }}></div>
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "12px", background: "rgba(255,255,255,0.1)", padding: "12px 20px", borderRadius: "100px", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.2)" }}>
              <i className="fa-solid fa-shield-halved" style={{ color: "var(--cyan-accent)", fontSize: "18px" }}></i>
              <span style={{ color: "white", fontWeight: 600, letterSpacing: "1px", fontSize: "14px", textTransform: "uppercase" }}>Secure Portal</span>
            </div>
          </div>
          <div style={{ position: "relative", zIndex: 1, maxWidth: "500px" }}>
            <h1 style={{ color: "white", fontSize: "48px", fontWeight: 800, lineHeight: 1.1, marginBottom: "20px", fontFamily: '"Outfit", sans-serif', letterSpacing: "-1px" }}>Intelligent Identity Extraction.</h1>
            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "18px", lineHeight: 1.6, fontWeight: 400 }}>Experience the next generation of automated data registry. Powerful OCR combined with an elegant workflow.</p>
          </div>
        </div>

        {/* Right Pane - Form */}
        <div className="login-right-pane">

          <div className="login-form-box">

            <div style={{ marginBottom: "48px" }}>
              <div style={{ width: "64px", height: "64px", background: "var(--indigo-light)", borderRadius: "18px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "24px", boxShadow: "0 8px 20px rgba(79, 70, 229, 0.2)", transform: "rotate(-4deg)" }}>
                <i className="fa-solid fa-passport" style={{ fontSize: "28px", color: "white", transform: "rotate(4deg)" }}></i>
              </div>
              <h2 style={{ fontFamily: '"Outfit", sans-serif', fontSize: "32px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "8px", letterSpacing: "-1px" }}>Welcome back</h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "16px", fontWeight: 400 }}>Please enter your details to sign in.</p>
            </div>

            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: "24px" }}>
                <label style={{ display: "block", marginBottom: "8px", color: "var(--text-primary)", fontSize: "14px", fontWeight: 600 }}>Username</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter your username" required style={{ width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", color: "var(--text-primary)", padding: "14px 16px", borderRadius: "12px", fontSize: "15px", fontWeight: 500, outline: "none", transition: "all 0.2s ease", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }} onFocus={e => { e.target.style.borderColor = "var(--indigo)"; e.target.style.boxShadow = "0 0 0 4px rgba(79, 70, 229, 0.1)"; }} onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "0 1px 2px rgba(0,0,0,0.05)"; }} />
              </div>

              <div style={{ marginBottom: "32px" }}>
                <label style={{ display: "block", marginBottom: "8px", color: "var(--text-primary)", fontSize: "14px", fontWeight: 600 }}>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required style={{ width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", color: "var(--text-primary)", padding: "14px 16px", borderRadius: "12px", fontSize: "15px", fontWeight: 500, outline: "none", transition: "all 0.2s ease", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }} onFocus={e => { e.target.style.borderColor = "var(--indigo)"; e.target.style.boxShadow = "0 0 0 4px rgba(79, 70, 229, 0.1)"; }} onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "0 1px 2px rgba(0,0,0,0.05)"; }} />
              </div>

              <button type="submit"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                style={{ width: "100%", padding: "16px", fontSize: "16px", fontWeight: 600, display: "flex", justifyContent: "center", alignItems: "center", background: "var(--text-primary)", border: "none", color: "white", borderRadius: "12px", cursor: "pointer", transition: "all 0.3s ease", transform: isHovered ? "translateY(-2px)" : "none", boxShadow: isHovered ? "0 10px 25px rgba(26, 29, 46, 0.2)" : "0 4px 10px rgba(26, 29, 46, 0.1)" }}>
                Sign in
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem("isAuthenticated") === "true";
  });

  useEffect(() => {
    localStorage.setItem("isAuthenticated", isAuthenticated);
  }, [isAuthenticated]);

  const [passports, setPassports] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeModalRecord, setActiveModalRecord] = useState(null);
  const [filterMode, setFilterMode] = useState("ALL");
  const [registryDocType, setRegistryDocType] = useState("ALL");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarFilterMode, setSidebarFilterMode] = useState("EXPIRING_SOON");
  const [activeTab, setActiveTab] = useState("UPLOAD");
  const [documentType, setDocumentType] = useState("PASSPORT");
  const [isScanning, setIsScanning] = useState(false);
  const [ocrProgressText, setOcrProgressText] = useState("Readying Engine...");
  const [ocrProgressPercent, setOcrProgressPercent] = useState(0);
  const [showOptional, setShowOptional] = useState(false);
  const [showOcrProgress, setShowOcrProgress] = useState(false);
  const [previewImage, setPreviewImage] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [formState, setFormState] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [toasts, setToasts] = useState([]);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const itemsPerPage = 10;
  const fileInputRef = useRef(null);
  const intervalRef = useRef(null);

  const addToast = useCallback((message, type = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  const openMobileSidebar = () => setMobileSidebarOpen(true);
  const closeMobileSidebar = () => setMobileSidebarOpen(false);

  useEffect(() => {
    fetchPassports();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const fetchPassports = async () => {
    try {
      const response = await fetch(`${API_BASE}/passports`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setPassports(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load passports:", err);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterMode, registryDocType]);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files?.length) processUploadedFiles(Array.from(files));
  };
  const handleFileChange = (e) => {
    const files = e.target.files;
    if (files?.length) processUploadedFiles(Array.from(files));
    e.target.value = "";
  };

  const ACCEPTED_IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|tiff?|bmp|gif|avif|heic|heif|svg|ico|pdf)$/i;
  const NON_PREVIEWABLE = /\.(heic|heif|avif|tiff?|bmp|svg|ico)$/i;

  const processUploadedFiles = (files) => {
    if (!files?.length) return;
    const validFiles = files;
    if (!validFiles.length) {
      addToast("Please upload a file.", "error");
      return;
    }
    if (validFiles.length === 1) {
      const file = validFiles[0];
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      if (isPdf) setPreviewImage("__PDF__:" + file.name);
      else if (!NON_PREVIEWABLE.test(file.name) && file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => setPreviewImage(e.target.result);
        reader.onerror = () => setPreviewImage("__PROCESSING__");
        reader.readAsDataURL(file);
      } else setPreviewImage("__PROCESSING__");
    } else {
      setPreviewImage(`__MULTI__:${validFiles.length}:${validFiles.map(f => f.name).join(", ")}`);
    }
    runOCRPipeline(validFiles);
  };

  const runOCRPipeline = async (filesInput) => {
    const files = Array.isArray(filesInput) ? filesInput : [filesInput];
    if (!files.length) return;
    setIsScanning(true);
    setShowOcrProgress(true);
    setOcrProgressPercent(15);
    setOcrProgressText(files.length > 1 ? `Uploading ${files.length} documents...` : "Uploading document...");

    try {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        setOcrProgressPercent(prev => {
          if (prev >= 90) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return 90;
          }
          return Math.min(prev + 15, 90);
        });
        setOcrProgressText(prev => {
          if (prev.startsWith("Uploading")) return "Initializing Extraction Engine...";
          if (prev === "Initializing Extraction Engine...") return files.length > 1 ? "Extracting text from multiple files..." : "Extracting text from document...";
          if (prev.startsWith("Extracting text")) return "Parsing document fields...";
          return "Finalizing extraction...";
        });
      }, 700);

      let response;
      let resData;

      if (files.length === 1) {
        const formData = new FormData();
        formData.append("docType", documentType);
        formData.append("file", files[0]);
        response = await fetch(`${API_BASE}/scan`, { method: "POST", body: formData });
        if (intervalRef.current) clearInterval(intervalRef.current);
        resData = await response.json().catch(() => ({}));
      } else {
        const formData = new FormData();
        formData.append("docType", documentType);
        files.forEach(f => formData.append("files", f));
        response = await fetch(`${API_BASE}/scan-multi`, { method: "POST", body: formData });
        if (intervalRef.current) clearInterval(intervalRef.current);
        resData = await response.json().catch(() => ({}));
      }

      console.log("[OCR] Server response:", JSON.stringify(resData, null, 2));

      if (response.ok && resData.success) {
        setOcrProgressPercent(100);
        setOcrProgressText("Extraction complete! (v2)");

        if (files.length === 1) {
          setEditId(null);
          setActiveModalRecord(null);
          const info = resData.data || {};
          const detectedDocType = info.docType || documentType;
          console.log("Raw OCR Output:\n", resData.rawText || "");
          setDocumentType(detectedDocType);

          const { firstName: cleanedFirstName, lastName: cleanedLastName, memberName: memberNameVal } =
            applyProperNameHandling(info, detectedDocType);

          setFormState({
            ...EMPTY_FORM,
            ...info,
            docType: detectedDocType,
            lastName: cleanedLastName || info.lastName || info.surname || "",
            firstName: cleanedFirstName || info.firstName || info.givenNames || "",
            memberName: memberNameVal || info.memberName || "",
            fatherName: cleanRelativeName((info.fatherName || "").replace(/\bKgarwal\b/gi, "Agarwal")),
            motherName: cleanRelativeName((info.motherName || "").replace(/\bKgarwal\b/gi, "Agarwal")),
            spouseName: cleanRelativeName(info.spouseName || ""),
          });
          // Auto-show optional fields if any optional data is present
          const optionalVals = [info.address, info.fatherName, info.motherName, info.spouseName, info.oldPassportNo, info.fileNo];
          if (optionalVals.some(v => v && v.trim())) {
            setShowOptional(true);
          }

          if (resData.previewUrl || resData.imageUrl) {
            setPreviewImage(resData.previewUrl || resData.imageUrl);
          }
          addToast(`${detectedDocType === "INSURANCE" ? "Insurance" : "Passport"} data extracted successfully!`, "success");
        } else {
          const results = Array.isArray(resData.results) ? resData.results : [];
          if (!results.length) {
            addToast("No data could be extracted from uploaded files.", "error");
            return;
          }

          const combinedRaw = results.map((r, idx) => `=== FILE ${idx + 1} ===\n${r.rawText || ""}`).join("\n\n");
          console.log("Raw OCR Output:\n", combinedRaw);

          const mergedInfo = { ...EMPTY_FORM, docType: "" };
          let detectedDocType = documentType;

          results.forEach(r => {
            const info = r.data || {};
            if (info.docType) detectedDocType = info.docType;
            Object.keys(info).forEach(key => {
              if (info[key] && !mergedInfo[key]) mergedInfo[key] = info[key];
            });
          });

          // Apply proper name handling (clean surname, split "SS" filler, build memberName)
          const { firstName: cleanedMergedFirst, lastName: cleanedMergedLast, memberName: mergedMemberName } =
            applyProperNameHandling(mergedInfo, detectedDocType);

          // mergedInfo now contains cleaned fields for later use
          // (the helper mutates a copy, so we keep the cleaned values separately)


          setDocumentType(detectedDocType);
          setFormState({
            ...EMPTY_FORM,
            ...mergedInfo,
            docType: detectedDocType,
            lastName: cleanedMergedLast || mergedInfo.lastName || mergedInfo.surname || "",
            firstName: cleanedMergedFirst || mergedInfo.firstName || mergedInfo.givenNames || "",
            memberName: mergedMemberName || mergedInfo.memberName || "",
            fatherName: cleanRelativeName((mergedInfo.fatherName || "").replace(/\bKgarwal\b/gi, "Agarwal")),
            motherName: cleanRelativeName((mergedInfo.motherName || "").replace(/\bKgarwal\b/gi, "Agarwal")),
            spouseName: cleanRelativeName(mergedInfo.spouseName || ""),
          });

          if (results[0] && (results[0].previewUrl || results[0].imageUrl)) {
            setPreviewImage(results[0].previewUrl || results[0].imageUrl);
          }

          let autoSavedCount = 0;
          for (const r of results) {
            const d = r.data;
            if (d && (d.passportNo || d.policyNo || d.lastName || d.memberName || mergedMemberName)) {
              d.firstName = d.firstName || cleanedMergedFirst;
              d.lastName = d.lastName || cleanedMergedLast;
              d.memberName = d.memberName || mergedMemberName;
              d.phone = d.phone || mergedInfo.phone;
              d.email = d.email || mergedInfo.email;
              d.address = d.address || mergedInfo.address;
              try {
                const res = await fetch(`${API_BASE}/passports`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ...d, previewImage: r.previewUrl || r.imageUrl || "" })
                });
                if (res.ok) autoSavedCount++;
              } catch (e) {
                console.warn("Auto save record failed:", e);
              }
            }
          }

          if (autoSavedCount > 0) await fetchPassports();

          addToast(
            `Extracted data from ${results.length} files successfully! ${autoSavedCount ? `(${autoSavedCount} records saved to Registry)` : ""}`,
            "success"
          );
        }
      } else {
        addToast("Server could not parse the document(s). Please verify manually.", "error");
      }
    } catch (err) {
      console.error("Scan error:", err);
      addToast("OCR upload error. Check backend connections.", "error");
    } finally {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setIsScanning(false);
      setTimeout(() => setShowOcrProgress(false), 1000);
    }
  };

  const handleDemoMode = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 500;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const gradient = ctx.createLinearGradient(0, 0, 800, 500);
    gradient.addColorStop(0, "#0d1527");
    gradient.addColorStop(0.5, "#121e36");
    gradient.addColorStop(1, "#080d1a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 500);

    ctx.strokeStyle = "rgba(28, 25, 34, 0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 20) {
      ctx.beginPath(); ctx.moveTo(i, 0);
      ctx.bezierCurveTo(i + 50, 150, i - 50, 350, i, 500); ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += 20) {
      ctx.beginPath(); ctx.moveTo(0, i);
      ctx.bezierCurveTo(200, i + 50, 600, i - 50, 800, i); ctx.stroke();
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px Outfit, Arial, sans-serif";
    ctx.fillText("REPUBLIC OF UTOPIA", 40, 50);
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.font = "14px Inter, Arial, sans-serif";
    ctx.fillText("PASSPORT / PASSEPORT", 40, 75); 
    ctx.fillStyle = "#1b2a47";
    ctx.fillRect(40, 110, 150, 200);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 110, 150, 200);
    ctx.fillStyle = "#304770";
    ctx.beginPath(); ctx.arc(115, 175, 30, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(60, 260);
    ctx.bezierCurveTo(60, 220, 170, 220, 170, 260); ctx.closePath(); ctx.fill();

    const fields = [
      { lbl: "PASSPORT NO.", val: "A12345678", x: 220, y: 125, hl: true },
      { lbl: "SURNAME", val: "DOE", x: 220, y: 175 },
      { lbl: "GIVEN NAMES", val: "JANE ELIZABETH", x: 220, y: 225 },
      { lbl: "NATIONALITY", val: "UTOPIAN", x: 220, y: 275 },
      { lbl: "SEX", val: "F", x: 220, y: 325 },
      { lbl: "DATE OF BIRTH", val: "12 MAR 1990", x: 300, y: 325 },
      { lbl: "DATE OF ISSUE", val: "12 MAR 2020", x: 500, y: 325 },
      { lbl: "DATE OF EXPIRY", val: "12 MAR 2030", x: 220, y: 375 },
    ];
    fields.forEach(f => {
      ctx.fillStyle = "#a0aec0"; ctx.font = "bold 11px Arial, sans-serif"; ctx.fillText(f.lbl, f.x, f.y);
      ctx.fillStyle = f.hl ? "#a78bfa" : "#ffffff";
      ctx.font = f.hl ? "bold 18px monospace" : "bold 15px Arial, sans-serif";
      ctx.fillText(f.val, f.x, f.y + 20);
    });

    ctx.fillStyle = "#f5f5f5"; ctx.fillRect(20, 410, 760, 75);
    ctx.fillStyle = "#1a202c"; ctx.font = "bold 16px Courier New, Courier, monospace";
    ctx.fillText("P<UTODOE<<JANE<ELIZABETH<<<<<<<<<<<<<<<<<<<<", 40, 440);
    ctx.fillText("A123456784UTO9003129F3003127<<<<<<<<<<<<<<<6", 40, 468);

    const base64Image = canvas.toDataURL("image/png");
    setPreviewImage(base64Image);
    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], "mock_passport.png", { type: "image/png" });
      runOCRPipeline(file);
    }, "image/png");
  };


  const handleInputChange = e => {
    let { name, value } = e.target;
    // Auto-format as user types
    if (UPPERCASE_FIELDS.has(name)) value = value.toUpperCase();
    else if (TITLECASE_FIELDS.has(name)) value = toTitleCase(value);
    setFormState(prev => {
      const next = { ...prev, [name]: value };
      if (name === "memberName") {
        const parts = value.trim().split(/\s+/);
        next.firstName = toTitleCase(parts[0] || "");
        next.lastName = toTitleCase(parts.slice(1).join(" ") || "");
      } else if (name === "firstName" || name === "lastName") {
        next.memberName = toTitleCase(`${next.firstName || ""} ${next.lastName || ""}`.trim());
      }
      return next;
    });
  };

  const handleClearForm = () => {
    setFormState({ ...EMPTY_FORM, docType: documentType });
    setEditId(null); setPreviewImage(""); setShowOcrProgress(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFormSubmit = async e => {
    e.preventDefault();

    // Validate required passport fields
    if (formState.docType === "PASSPORT") {
      const errors = [];

      // --- Presence check ---
      const required = [
        ["passportNo", "Passport Number"],
        ["issuingCountry", "Issuing Country Code"],
        ["firstName", "First Name"],
        ["lastName", "Last Name"],
        ["nationality", "Nationality"],
        ["sex", "Gender"],
        ["issueDate", "Date of Issue"],
        ["doe", "Date of Expiry"],
        ["dob", "Date of Birth"],
        ["placeOfIssue", "Place of Issue"],
        ["placeOfBirth", "Place of Birth"]];
      const missing = required.filter(([k]) => !formState[k] || !formState[k].toString().trim()).map(([, l]) => l);
      if (missing.length > 0) {
        addToast(`Please fill in: ${missing.join(", ")}`, "error");
        return;
      }

      // --- Format / data quality checks ---
      const pno = (formState.passportNo || "").trim();
      if (!/^[A-Z0-9]{6,9}$/i.test(pno))
        errors.push("Passport Number must be 6–9 alphanumeric characters (e.g. A1234567)");

      const iso3 = (formState.issuingCountry || "").trim();
      if (!/^[A-Z]{3}$/i.test(iso3))
        errors.push("Issuing Country Code must be exactly 3 letters (e.g. IND)");

      const nat = (formState.nationality || "").trim();
      if (!/^[A-Z]{2,20}$/i.test(nat))
        errors.push("Nationality must be 2–20 letters only (e.g. IND or INDIAN)");

      const firstName = (formState.firstName || "").trim();
      if (firstName.length < 2 || /\d/.test(firstName))
        errors.push("First Name must be at least 2 letters with no digits");

      const lastName = (formState.lastName || "").trim();
      if (lastName.length < 2 || /\d/.test(lastName))
        errors.push("Last Name must be at least 2 letters with no digits");

      const sex = (formState.sex || "").trim().toUpperCase();
      if (!["M", "F", "X"].includes(sex))
        errors.push("Gender must be M, F, or X");

      // Date validity
      const dob = new Date(formState.dob);
      const doe = new Date(formState.doe);
      const issueDate = new Date(formState.issueDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (isNaN(dob.getTime()))
        errors.push("Date of Birth is not a valid date");
      else if (dob >= today)
        errors.push("Date of Birth must be in the past");

      if (isNaN(doe.getTime()))
        errors.push("Date of Expiry is not a valid date");
      else if (!isNaN(dob.getTime()) && doe <= dob)
        errors.push("Date of Expiry must be after Date of Birth");

      if (isNaN(issueDate.getTime()))
        errors.push("Date of Issue is not a valid date");
      else {
        if (!isNaN(dob.getTime()) && issueDate < dob)
          errors.push("Date of Issue cannot be before Date of Birth");
        if (!isNaN(doe.getTime()) && issueDate >= doe)
          errors.push("Date of Issue must be before Date of Expiry");
      }

      if (errors.length > 0) {
        // Show first error prominently, list the rest
        addToast(errors[0], "error");
        if (errors.length > 1)
          setTimeout(() => addToast(`Also check: ${errors.slice(1).join(" | ")}`, "error"), 400);
        return;
      }
    }


    const cleanPreview = isPreviewable(previewImage) ? previewImage : "";
    const recordPayload = { ...formState, previewImage: cleanPreview };
    try {
      let response;
      if (editId) {
        response = await fetch(`${API_BASE}/passports/${editId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(recordPayload) });
      } else {
        response = await fetch(`${API_BASE}/passports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(recordPayload) });
      }
      if (response.ok) {
        addToast(editId ? "Record updated successfully!" : "Record saved successfully!", "success");
        await fetchPassports();
        handleClearForm();
      } else {
        let errorMessage = "Failed to save record.";
        try {
          const errorData = await response.json();
          if (errorData.message) errorMessage = errorData.message;
        } catch { }
        addToast(errorMessage, "error");
      }
    } catch (err) {
      console.error("Save error:", err);
      addToast("Error occurred while saving to server.", "error");
    }
  };

  const handleDelete = async id => {
    if (!window.confirm("Are you sure you want to delete this record?")) return;
    try {
      const response = await fetch(`${API_BASE}/passports/${id}`, { method: "DELETE" });
      if (response.ok) {
        addToast("Record deleted.", "success");
        await fetchPassports();
      } else addToast("Failed to delete record.", "error");
    } catch (err) {
      console.error("Delete error:", err);
      addToast("Error occurred while deleting.", "error");
    }
  };

  const handleEdit = record => {
    const dType = record.docType || "PASSPORT";
    setDocumentType(dType);
    const fName = record.firstName || record.givenNames || "";
    const lName = record.lastName || record.surname || "";
    const mName = record.memberName || (fName || lName ? `${fName} ${lName}`.trim() : "");
    setFormState({
      ...EMPTY_FORM,
      ...record,
      docType: dType,
      lastName: lName,
      firstName: fName,
      memberName: mName,
      fatherName: cleanRelativeName((record.fatherName || "").replace(/\bKgarwal\b/gi, "Agarwal")),
      motherName: cleanRelativeName((record.motherName || "").replace(/\bKgarwal\b/gi, "Agarwal")),
      spouseName: cleanRelativeName(record.spouseName || ""),
    });
    setEditId(record.id);
    setPreviewImage(record.previewImage || "");
    setActiveTab("UPLOAD");
    closeMobileSidebar();
    setTimeout(() => document.getElementById("details-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const handleExportCSV = () => {
    if (!passports.length) { addToast("Database is empty.", "error"); return; }
    window.location.href = `${API_BASE}/export/csv`;
  };
  const handleExportJSON = () => {
    if (!passports.length) { addToast("Database is empty.", "error"); return; }
    window.location.href = `${API_BASE}/export/json`;
  };


  const today = new Date();
  const sixMonthsFromNow = new Date();
  sixMonthsFromNow.setMonth(today.getMonth() + 6);

  let expiringSoonCount = 0, validCount = 0, expiredCount = 0;
  passports.forEach(item => {
    if (item.doe) {
      const expiryDate = new Date(item.doe);
      if (isNaN(expiryDate.getTime())) validCount++;
      else if (expiryDate < today) expiredCount++;
      else if (expiryDate <= sixMonthsFromNow) { expiringSoonCount++; validCount++; }
      else validCount++;
    } else validCount++;
  });
  const totalCount = passports.length;

  const filteredPassports = passports.filter(item => {
    const query = searchQuery.toLowerCase().trim();
    const firstName = item.firstName || item.givenNames || "";
    const lastName = item.lastName || item.surname || "";
    const fullName = `${firstName} ${lastName}`.toLowerCase();

    const matchesSearch =
      !query ||
      (item.passportNo && item.passportNo.toLowerCase().includes(query)) ||
      (item.policyNo && item.policyNo.toLowerCase().includes(query)) ||
      (item.lastName && item.lastName.toLowerCase().includes(query)) ||
      (item.surname && item.surname.toLowerCase().includes(query)) ||
      (item.firstName && item.firstName.toLowerCase().includes(query)) ||
      (item.givenNames && item.givenNames.toLowerCase().includes(query)) ||
      (item.memberName && item.memberName.toLowerCase().includes(query)) ||
      fullName.includes(query) ||
      (item.nationality && item.nationality.toLowerCase().includes(query));

    if (!matchesSearch) return false;
    if (registryDocType !== "ALL" && (item.docType || "PASSPORT") !== registryDocType) return false;
    if (filterMode === "ALL") return true;

    const expiryDate = item.doe ? new Date(item.doe) : null;
    const isDateValid = expiryDate && !isNaN(expiryDate.getTime());
    if (filterMode === "EXPIRED") return isDateValid && expiryDate < today;
    if (filterMode === "EXPIRING_SOON") return isDateValid && expiryDate >= today && expiryDate <= sixMonthsFromNow;
    if (filterMode === "VALID") return !isDateValid || expiryDate >= today;
    return true;
  });

  const sidebarPassports = passports.filter(item => {
    if (sidebarFilterMode === "ALL") return true;
    const expiryDate = item.doe ? new Date(item.doe) : null;
    const isDateValid = expiryDate && !isNaN(expiryDate.getTime());
    if (sidebarFilterMode === "EXPIRED") return isDateValid && expiryDate < today;
    if (sidebarFilterMode === "EXPIRING_SOON") return isDateValid && expiryDate >= today && expiryDate <= sixMonthsFromNow;
    if (sidebarFilterMode === "VALID") return !isDateValid || expiryDate >= today;
    return true;
  });

  const isPreviewable = url => typeof url === 'string' && url.trim().length > 10 && !url.startsWith("__");
  const getFilterLabel = mode => ({ ALL: "All Records", VALID: "Valid Documents", EXPIRING_SOON: "Expiring Soon", EXPIRED: "Expired" }[mode] || "Records");
  const formatDateString = dateStr => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  const getStatus = item => {
    if (!item.doe) return { cls: "badge-success", text: "Valid" };
    const d = new Date(item.doe);
    if (isNaN(d.getTime())) return { cls: "badge-success", text: "Valid" };
    if (d < today) return { cls: "badge-danger", text: "Expired" };
    if (d <= sixMonthsFromNow) return { cls: "badge-warning", text: "Expiring Soon" };
    return { cls: "badge-success", text: "Valid" };
  };

  const calculateMRZCheckDigit = str => {
    const weights = [7, 3, 1];
    let sum = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charAt(i);
      let value = 0;
      if (char >= "0" && char <= "9") value = parseInt(char, 10);
      else if (char >= "A" && char <= "Z") value = char.charCodeAt(0) - 55;
      sum += value * weights[i % 3];
    }
    return sum % 10;
  };

  const getMRZLine1 = record => {
    if (!record) return "";
    const country = (record.issuingCountry || "UTO").padEnd(3, "<").substring(0, 3);
    const sName = (record.lastName || record.surname || "").replace(/[^A-Z]/gi, "").toUpperCase();
    const gName = (record.firstName || record.givenNames || "").replace(/[^A-Z\s]/gi, "").replace(/\s+/g, "<").toUpperCase();
    return `P<${country}${`${sName}<<${gName}`.padEnd(39, "<").substring(0, 39)}`.toUpperCase();
  };

  const getMRZLine2 = record => {
    if (!record) return "";
    const docNo = (record.passportNo || "").toUpperCase().padEnd(9, "<").substring(0, 9);
    const check1 = calculateMRZCheckDigit(docNo);
    const nationality = (record.nationality || "UTO").toUpperCase().padEnd(3, "<").substring(0, 3);
    const dobRaw = record.dob ? record.dob.replace(/-/g, "") : "19900101";
    const dobYYMMDD = dobRaw.length === 8 ? dobRaw.substring(2) : "900101";
    const check2 = calculateMRZCheckDigit(dobYYMMDD);
    const sexChar = record.sex ? record.sex.substring(0, 1).toUpperCase() : "<";
    const doeRaw = record.doe ? record.doe.replace(/-/g, "") : "20300101";
    const doeYYMMDD = doeRaw.length === 8 ? doeRaw.substring(2) : "300101";
    const check3 = calculateMRZCheckDigit(doeYYMMDD);
    const personalNo = "".padEnd(14, "<");
    return `${docNo}${check1}${nationality}${dobYYMMDD}${check2}${sexChar}${doeYYMMDD}${check3}${personalNo}0` + "8";
  };

  const totalPages = Math.max(1, Math.ceil(filteredPassports.length / itemsPerPage));
  const paginatedPassports = filteredPassports.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleQuickFilter = mode => {
    setFilterMode(mode); setSidebarFilterMode(mode); setIsSidebarOpen(true); setActiveTab("REGISTRY"); closeMobileSidebar();
  };
  const handleStatClick = mode => {
    setFilterMode(mode); setSidebarFilterMode(mode); setIsSidebarOpen(true);
    if (activeTab !== "REGISTRY") setActiveTab("REGISTRY");
  };

  if (!isAuthenticated) {
    return <LoginPage onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="app-container dashboard-layout">
      <div className="toast-container">
        {toasts.map(t => <div key={t.id} className={`toast toast-${t.type}`}>
          <i className={`fa-solid ${t.type === "success" ? "fa-circle-check" : t.type === "error" ? "fa-circle-xmark" : "fa-circle-info"}`}></i>
          {t.message}
        </div>)}
      </div>
      <div className={`mobile-sidebar-overlay ${mobileSidebarOpen ? "active" : ""}`} onClick={closeMobileSidebar}></div>
      <aside className={`sidebar ${mobileSidebarOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-header"><div className="logo-icon"><i className="fa-solid fa-passport"></i></div><div className="logo-text"><h1>PASSPORT</h1><span>Registry System</span></div></div>
        <nav className="sidebar-nav">
          <div className="nav-section-label">Main Menu</div>
          <button className={`nav-btn ${activeTab === "UPLOAD" ? "active" : ""}`} onClick={() => { setActiveTab("UPLOAD"); closeMobileSidebar(); }}><i className="fa-solid fa-cloud-arrow-up"></i><span>Upload Document</span></button>
          <button className={`nav-btn ${activeTab === "REGISTRY" ? "active" : ""}`} onClick={() => { setActiveTab("REGISTRY"); closeMobileSidebar(); }}><i className="fa-solid fa-folder-open"></i><span>Documents & Registry</span></button>
          <div className="nav-section-label" style={{ marginTop: "12px" }}>Quick Filters</div>
          <button className={`nav-btn ${filterMode === "ALL" && activeTab === "REGISTRY" ? "active" : ""}`} onClick={() => { setFilterMode("ALL"); setActiveTab("REGISTRY"); closeMobileSidebar(); setIsSidebarOpen(false); }}>
            <i className="fa-solid fa-layer-group"></i><span style={{ flex: 1 }}>Total</span><span style={{ background: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>{totalCount}</span>
          </button>
          <button className={`nav-btn ${filterMode === "VALID" && activeTab === "REGISTRY" ? "active" : ""}`} onClick={() => { setFilterMode("VALID"); setActiveTab("REGISTRY"); closeMobileSidebar(); setIsSidebarOpen(false); }}>
            <i className="fa-solid fa-circle-check"></i><span style={{ flex: 1 }}>Valid</span><span style={{ background: 'rgba(5, 150, 105, 0.3)', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>{validCount}</span>
          </button>
          <button className={`nav-btn ${filterMode === "EXPIRING_SOON" && activeTab === "REGISTRY" ? "active" : ""}`} onClick={() => { setFilterMode("EXPIRING_SOON"); setActiveTab("REGISTRY"); closeMobileSidebar(); setIsSidebarOpen(false); }}>
            <i className="fa-solid fa-clock"></i><span style={{ flex: 1 }}>Expiring Soon</span><span style={{ background: 'rgba(217, 119, 6, 0.3)', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>{expiringSoonCount}</span>
          </button>
          <button className={`nav-btn ${filterMode === "EXPIRED" && activeTab === "REGISTRY" ? "active" : ""}`} onClick={() => { setFilterMode("EXPIRED"); setActiveTab("REGISTRY"); closeMobileSidebar(); setIsSidebarOpen(false); }}>
            <i className="fa-solid fa-circle-exclamation"></i><span style={{ flex: 1 }}>Expired</span><span style={{ background: 'rgba(225, 29, 72, 0.3)', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>{expiredCount}</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <button className="nav-btn logout-btn" onClick={() => setIsAuthenticated(false)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '14px', padding: '13px 16px', color: '#ffffff', background: '#dc2626', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'all 0.2s ease', boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)' }}>
            <i className="fa-solid fa-arrow-right-from-bracket"></i>
            <span style={{ fontWeight: 600, letterSpacing: '0.5px' }}>Logout</span>
          </button>
        </div>
      </aside>

      <div className="main-content">
        <header className="top-header">
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <button className="mobile-header-toggle" onClick={openMobileSidebar}><i className="fa-solid fa-bars"></i></button>
            <div className="top-header-title"><h2>{activeTab === "UPLOAD" ? "Upload Document" : "Documents & Registry"}</h2></div>
          </div>

          <div className="db-stats-filters">
            <div className={`stat-card stat-total ${filterMode === "ALL" ? "active" : ""}`} onClick={() => handleStatClick("ALL")}>
              <i className="fa-solid fa-folder-open stat-icon"></i>
              <div className="stat-val">{totalCount}</div>
              <div className="stat-lbl">Total</div>
            </div>
            <div className={`stat-card stat-valid ${filterMode === "VALID" ? "active" : ""}`} onClick={() => handleStatClick("VALID")}>
              <i className="fa-solid fa-circle-check stat-icon"></i>
              <div className="stat-val">{validCount}</div>
              <div className="stat-lbl">Valid</div>
            </div>
            <div className={`stat-card stat-expiring ${filterMode === "EXPIRING_SOON" ? "active" : ""}`} onClick={() => handleStatClick("EXPIRING_SOON")}>
              <i className="fa-solid fa-clock stat-icon"></i>
              <div className="stat-val">{expiringSoonCount}</div>
              <div className="stat-lbl">Expiring Soon</div>
            </div>
            <div className={`stat-card stat-expired ${filterMode === "EXPIRED" ? "active" : ""}`} onClick={() => handleStatClick("EXPIRED")}>
              <i className="fa-solid fa-circle-exclamation stat-icon"></i>
              <div className="stat-val">{expiredCount}</div>
              <div className="stat-lbl">Expired</div>
            </div>
          </div>
        </header>

        {activeTab === "UPLOAD" && (
          <main>
            <div className="panel">
              <div className="panel-header text-center"><div><h2 className="panel-title text-center"><i className="fa-solid fa-camera"></i> Document Registration Portal</h2><p className="panel-subtitle text-center">Upload any image (Passport or Insurance card) — JPG, PNG, HEIC, AVIF, TIFF, BMP and more. Data is extracted automatically.</p></div></div>
              <div className="registration-grid-layout">
                <div className="doc-type-selector" style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "center", gap: "20px", marginBottom: "20px" }}>
                  <button type="button" className={`btn ${documentType === "PASSPORT" ? "btn-primary" : "btn-secondary"}`} onClick={() => { setDocumentType("PASSPORT"); setFormState(p => ({ ...p, docType: "PASSPORT" })); }}><i className="fa-solid fa-passport"></i> Passport</button>
                  <button type="button" className={`btn ${documentType === "INSURANCE" ? "btn-primary" : "btn-secondary"}`} onClick={() => { setDocumentType("INSURANCE"); setFormState(p => ({ ...p, docType: "INSURANCE" })); }}><i className="fa-solid fa-id-card-clip"></i> Insurance</button>
                </div>
                <div className="scan-section-centered">
                  {!previewImage && <div className={`upload-container ${isDragOver ? "dragover" : ""}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}>
                    <div className="upload-icon"><i className="fa-solid fa-cloud-arrow-up"></i></div><div className="upload-text"><h3>Drag & drop any document or image(s)</h3><p>Supports all file formats including images and PDFs — single or multiple files</p></div>
                    <button type="button" className="btn btn-secondary" onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}><i className="fa-solid fa-file-arrow-up"></i> Browse Files</button>
                  </div   >}
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} className="file-input" multiple />
                  {previewImage && <div className="preview-container" style={{ position: "relative" }}>
                    <button type="button" onClick={e => { e.stopPropagation(); handleClearForm(); }} title="Remove Image" style={{ position: "absolute", top: "10px", right: "10px", background: "rgba(220, 38, 38, 0.9)", color: "white", border: "none", borderRadius: "50%", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 6px rgba(0,0,0,0.3)", zIndex: 10 }}><i className="fa-solid fa-xmark"></i></button>
                    {previewImage.startsWith("__PDF__:") ? <div><i className="fa-solid fa-file-pdf"></i><h4>{previewImage.replace("__PDF__:", "")}</h4><p>{isScanning ? "Extracting text from PDF document..." : "PDF Document Loaded"}</p></div>
                      : previewImage.startsWith("__MULTI__:") ? <div><i className="fa-solid fa-copy"></i><h4>{previewImage.split(":")[1]} Files Selected</h4><p>{previewImage.split(":").slice(2).join(":")}</p></div>
                        : previewImage === "__PROCESSING__" ? <div><i className="fa-solid fa-file-image"></i><p>{isScanning ? "Processing image — preview will appear after extraction..." : "Image uploaded — server-side preview loading..."}</p></div>
                          : <img src={previewImage} alt="Document Preview" className="passport-preview-img" onError={e => { e.currentTarget.style.display = "none"; }} />}
                    {isScanning && <div className="processing-overlay"><div className="spinner"></div><span>Extracting text...</span></div>}
                  </div>}
                  {showOcrProgress && <div className="ocr-progress-container"><div className="ocr-status-header"><span>{ocrProgressText}</span><span>{ocrProgressPercent}%</span></div><div className="ocr-progress-bar-bg"><div className="ocr-progress-bar-fill" style={{ width: `${ocrProgressPercent}%` }}></div></div></div>}
                  <div className="demo-trigger-wrapper"><button type="button" className="demo-trigger-btn" onClick={handleDemoMode}><i className="fa-solid fa-wand-magic-sparkles"></i> Try with Sample Passport Image</button></div>
                </div>

                <form id="details-form" onSubmit={handleFormSubmit} className="details-form-centered">
                  <h3 className="section-divider-title"><i className="fa-solid fa-file-signature"></i> Verification Details</h3>
                  <div className="form-grid">
                    {formState.docType === "PASSPORT" ? <>
                      {[
                        ["passportNo", "Passport Number", "fa-id-card", "e.g. A12345678", true],
                        ["issuingCountry", "Issuing Country Code", "fa-map-location-dot", "e.g. IND (3 letters)", true],
                        ["firstName", "First Name", "fa-user", "First Name", true],
                        ["lastName", "Last Name", "fa-user-tag", "Last Name", true],
                        ["nationality", "Nationality", "fa-globe", "e.g. IND or INDIAN (letters only)", true]
                      ].map(([name, label, icon, placeholder, req]) => <div className="form-group" key={name}><label>{label} {req && <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 400 }}>(required)</span>}</label><div className="input-wrapper"><i className={`fa-solid ${icon}`}></i><input type="text" name={name} className="form-control" placeholder={placeholder} value={formState[name] || ""} onChange={handleInputChange} required={req} autoComplete="off" maxLength={name === "issuingCountry" ? 3 : undefined} /></div></div>)}
                      <div className="form-group"><label>Gender <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 400 }}>(required)</span></label><div className="input-wrapper"><i className="fa-solid fa-venus-mars"></i><select name="sex" className="form-control" value={formState.sex || ""} onChange={handleInputChange} required><option value="">Select Gender</option><option value="M">Male</option><option value="F">Female</option><option value="X">Non-binary / Other</option></select></div></div>
                      {[["issueDate", "Date of Issue"], ["doe", "Date of Expiry"], ["dob", "Date of Birth"]].map(([name, label]) => <div className="form-group" key={name}><label>{label} <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 400 }}>(required)</span></label><div className="input-wrapper"><i className="fa-solid fa-calendar"></i><input type="date" name={name} className="form-control" value={formState[name] || ""} onChange={handleInputChange} required /></div></div>)}
                      {[
                        ["placeOfIssue", "Place of Issue", "fa-location-dot", "e.g. New Delhi (optional)"],
                        ["placeOfBirth", "Place of Birth", "fa-map-pin", "Place of birth (optional)"],
                        ["oldPassportNo", "Old Passport No.", "fa-rotate-left", "Previous passport number (optional)"],
                        ["fileNo", "File No.", "fa-file-lines", "Internal file reference (optional)"]
                      ].map(([name, label, icon, placeholder]) => <div className="form-group" key={name}><label>{label}</label><div className="input-wrapper"><i className={`fa-solid ${icon}`}></i><input type="text" name={name} className="form-control" placeholder={placeholder} value={formState[name] || ""} onChange={handleInputChange} autoComplete="off" /></div></div>)}
                    </> : <>
                      <div className="form-group"><label>Insurance Type</label><div className="input-wrapper"><i className="fa-solid fa-tags"></i><select name="insuranceType" className="form-control" value={formState.insuranceType || ''} onChange={handleInputChange}><option value="">Select Type...</option><option value="HEALTH">Health / Medical</option><option value="MOTOR">Motor / Vehicle</option><option value="LIFE">Life Insurance</option><option value="TRAVEL">Travel Insurance</option><option value="OTHER">Other</option></select></div></div>
                      {[
                        ["policyNo", "Policy Number", "fa-file-shield", "e.g. POL-12345678", true],
                        ["provider", "Provider", "fa-hospital", "e.g. GlobalHealth Insurance", true],
                        ["memberName", "Member Name", "fa-user", "Full name of the insured member", true],
                        ["groupNo", "Group No.", "fa-layer-group", "e.g. GRP-0042 (optional)", false]
                      ].map(([name, label, icon, placeholder, required]) => <div className="form-group" key={name}><label>{label}</label><div className="input-wrapper"><i className={`fa-solid ${icon}`}></i><input type="text" name={name} className="form-control" placeholder={placeholder} value={formState[name] || ''} onChange={handleInputChange} required={required} autoComplete="off" /></div></div>)}
                      {[["effectiveDate", "Effective Date"], ["doe", "Expiry Date"], ["dob", "Date of Birth"]].map(([name, label]) => <div className="form-group" key={name}><label>{label}</label><div className="input-wrapper"><i className="fa-solid fa-calendar"></i><input type="date" name={name} className="form-control" value={formState[name] || ''} onChange={handleInputChange} /></div></div>)}
                    </>}
                  </div>

                  {formState.docType === "INSURANCE" && formState.insuranceType === "HEALTH" && <>
                    <h4 className="section-divider-title" style={{ marginTop: "22px", fontSize: "0.85rem" }}><i className="fa-solid fa-briefcase-medical"></i> Health Details</h4>
                    <div className="form-grid">
                      {[["healthCardNo", "Health Card No.", "fa-id-card"], ["tpa", "TPA", "fa-building"], ["networkHospital", "Network Hospitals", "fa-hospital-user"], ["copayPercentage", "Copay %", "fa-percent"], ["sumInsured", "Sum Insured", "fa-money-bill"], ["roomRentLimit", "Room Rent Limit", "fa-bed"], ["hospitalizationLimit", "Hosp. Limit", "fa-hospital"], ["waitingPeriod", "Waiting Period", "fa-clock"], ["preExistingDisease", "Pre-Existing Dis.", "fa-virus"]].map(([name, label, icon]) => <div className="form-group" key={name}><label>{label}</label><div className="input-wrapper"><i className={`fa-solid ${icon}`}></i><input type="text" name={name} className="form-control" value={formState[name] || ''} onChange={handleInputChange} /></div></div>)}
                    </div>
                  </>}

                  {formState.docType === "INSURANCE" && formState.insuranceType === "MOTOR" && <>
                    <h4 className="section-divider-title" style={{ marginTop: "22px", fontSize: "0.85rem" }}><i className="fa-solid fa-car"></i> Vehicle Details</h4>
                    <div className="form-grid">
                      {[["vehicleNo", "Vehicle No.", "fa-car-side"], ["registrationNo", "Registration No.", "fa-id-badge"], ["vehicleType", "Vehicle Type", "fa-truck"], ["make", "Make", "fa-industry"], ["model", "Model", "fa-car"], ["variant", "Variant", "fa-layer-group"], ["engineNo", "Engine No.", "fa-gear"], ["chassisNo", "Chassis No.", "fa-truck-front"], ["idv", "IDV (Value)", "fa-money-check-dollar"], ["manufacturingYear", "Year", "fa-calendar-days"], ["ncb", "NCB %", "fa-percent"], ["fuelType", "Fuel Type", "fa-gas-pump"]].map(([name, label, icon]) => <div className="form-group" key={name}><label>{label}</label><div className="input-wrapper"><i className={`fa-solid ${icon}`}></i><input type="text" name={name} className="form-control" value={formState[name] || ''} onChange={handleInputChange} /></div></div>)}
                    </div>
                  </>}

                  {formState.docType === "INSURANCE" && formState.insuranceType === "LIFE" && <>
                    <h4 className="section-divider-title" style={{ marginTop: "22px", fontSize: "0.85rem" }}><i className="fa-solid fa-heart-pulse"></i> Life Insurance Details</h4>
                    <div className="form-grid">
                      {[["lifeAssured", "Life Assured", "fa-user-check"], ["nomineeName", "Nominee", "fa-users"], ["maturityDate", "Maturity Date", "fa-calendar-check"], ["deathBenefit", "Death Benefit", "fa-hand-holding-dollar"], ["maturityBenefit", "Maturity Benefit", "fa-money-bill-trend-up"], ["premium", "Premium Amount", "fa-money-bill-wave"], ["policyTermYears", "Term (Years)", "fa-hourglass"]].map(([name, label, icon]) => <div className="form-group" key={name}><label>{label}</label><div className="input-wrapper"><i className={`fa-solid ${icon}`}></i><input type="text" name={name} className="form-control" value={formState[name] || ''} onChange={handleInputChange} /></div></div>)}
                    </div>
                  </>}

                  {formState.docType === "INSURANCE" && formState.insuranceType === "TRAVEL" && <>
                    <h4 className="section-divider-title" style={{ marginTop: "22px", fontSize: "0.85rem" }}><i className="fa-solid fa-plane"></i> Travel Insurance Details</h4>
                    <div className="form-grid">
                      {[["travelStartDate", "Start Date", "fa-calendar-plus"], ["travelEndDate", "End Date", "fa-calendar-minus"], ["destination", "Destination", "fa-location-dot"], ["departureCountry", "Departure", "fa-plane-departure"], ["arrivalCountry", "Arrival", "fa-plane-arrival"], ["tripType", "Trip Type", "fa-route"], ["travellerCount", "Travellers", "fa-users"]].map(([name, label, icon]) => <div className="form-group" key={name}><label>{label}</label><div className="input-wrapper"><i className={`fa-solid ${icon}`}></i><input type="text" name={name} className="form-control" value={formState[name] || ''} onChange={handleInputChange} /></div></div>)}
                    </div>
                  </>}
                  {formState.docType === "INSURANCE" && <>
                    <h4 className="section-divider-title" style={{ marginTop: "22px", fontSize: "0.85rem" }}><i className="fa-solid fa-address-book"></i> Contact Details</h4>
                    <div className="form-grid">
                      {[
                        ["phone", "Phone Number", "fa-phone", "Contact phone number"],
                        ["email", "Email Address", "fa-envelope", "Contact email"],
                        ["address", "Address", "fa-house", "Full address"]
                      ].map(([name, label, icon, placeholder]) => <div className="form-group" key={name}><label>{label}</label><div className="input-wrapper"><i className={`fa-solid ${icon}`}></i><input type="text" name={name} className="form-control" placeholder={placeholder} value={formState[name] || ''} onChange={handleInputChange} autoComplete="off" /></div></div>)}
                    </div>
                  </>}
                  {formState.docType === "PASSPORT" && (
                    <>
                      <h4 className="section-divider-title" style={{ marginTop: "22px", fontSize: "0.85rem" }}>
                        <i className="fa-solid fa-circle-info"></i> Additional Details (Optional)
                      </h4>
                      <button type="button" className="btn btn-secondary" onClick={() => setShowOptional(prev => !prev)} style={{ marginBottom: "8px" }}>
                        {showOptional ? "Hide Optional Fields" : "Show Optional Fields"}
                      </button>
                      {showOptional && (
                        <div className="form-grid">
                          {[
                            ["address", "Address", "fa-house", "Holder's address"],
                            ["fatherName", "Father's Name", "fa-user-tie", "Father's full name"],
                            ["motherName", "Mother's Name", "fa-user", "Mother's full name"],
                            ["spouseName", "Spouse's Name", "fa-user-group", "Spouse's full name (if applicable)"],
                            ["oldPassportNo", "Old Passport No.", "fa-id-card", "Old passport number"],
                            ["fileNo", "File No.", "fa-file", "File number"]
                          ].map(([name, label, icon, placeholder]) => (
                            <div className="form-group" key={name}>
                              <label>{label}</label>
                              <div className="input-wrapper">
                                <i className={`fa-solid ${icon}`}></i>
                                <input type="text" name={name} className="form-control" placeholder={placeholder} value={formState[name] || ""} onChange={handleInputChange} autoComplete="off" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
  
                  <div className="form-actions-centered">
                    <button type="submit" className="btn btn-primary btn-submit-centered" disabled={isScanning}><i className="fa-solid fa-floppy-disk"></i> {editId ? "Update Record" : "Save Record"}</button>
                    <button type="button" className="btn btn-secondary" onClick={handleClearForm}><i className="fa-solid fa-eraser"></i> Clear</button>
                    {editId && <span className="edit-hint"><i className="fa-solid fa-pen"></i> Editing record #{editId}</span>}
                  </div>
                </form>
              </div>
            </div>
          </main>
        )}
        {activeTab === "REGISTRY" && (
          <main>
            <div className="database-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h2 className="panel-title"><i className="fa-solid fa-folder-open"></i> Document Registry</h2>
                  <p className="panel-subtitle">Showing {filteredPassports.length} of {totalCount} record{totalCount === 1 ? "" : "s"}</p>
                </div>
                <div className="db-actions">
                  <button className="btn-action" onClick={handleExportCSV}><i className="fa-solid fa-file-csv"></i> Export CSV</button>
                  <button className="btn-action" onClick={handleExportJSON}><i className="fa-solid fa-file-code"></i> Export JSON</button>
                </div>
              </div>
              <div className="db-toolbar" style={{ flexDirection: "column", alignItems: "stretch", gap: "16px" }}>
                <div style={{ display: "flex", gap: "12px", width: "100%" }}>
                  <div className="search-wrapper" style={{ flex: 1 }}><i className="fa-solid fa-magnifying-glass"></i><input type="text" className="search-input" placeholder="Search by name, number, or nationality..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button className={`btn ${registryDocType === 'ALL' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setRegistryDocType('ALL')}><i className="fa-solid fa-layer-group"></i> All</button>
                    <button className={`btn ${registryDocType === 'PASSPORT' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setRegistryDocType('PASSPORT')}><i className="fa-solid fa-passport"></i> Passports</button>
                    <button className={`btn ${registryDocType === 'INSURANCE' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setRegistryDocType('INSURANCE')}><i className="fa-solid fa-id-card-clip"></i> Insurance</button>
                  </div>
                </div>
              </div>
              <div className="table-responsive">
                <table className="passport-table">
                  <thead>
                    <tr>
                      <th style={{ background: 'var(--purple-mid)', color: '#fff', border: 'none' }}>
                        Preview
                      </th>
                      <th style={{ background: 'var(--purple-mid)', color: '#fff', border: 'none' }}>
                        Type
                      </th>
                      <th style={{ background: 'var(--purple-mid)', color: '#fff', border: 'none' }}
                      >Holder
                      </th>
                      <th style={{ background: 'var(--purple-mid)', color: '#fff', border: 'none' }}>
                        Number
                      </th>
                      <th style={{ background: 'var(--purple-mid)', color: '#fff', border: 'none' }}>
                        Nationality / Provider
                      </th>
                      <th style={{ background: 'var(--purple-mid)', color: '#fff', border: 'none' }}>
                        Date of Birth
                      </th>
                      <th style={{ background: 'var(--purple-mid)', color: '#fff', border: 'none' }}>
                        Expiry
                      </th>
                      <th style={{ background: 'var(--purple-mid)', color: '#fff', border: 'none' }}>
                        Status
                      </th>
                      <th style={{ background: 'var(--purple-mid)', color: '#fff', border: 'none' }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                    <tbody>{paginatedPassports.length === 0 ? <tr><td colSpan={9}><div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-folder-open"></i></div><h4>No records found</h4><p>Upload a document to get started.</p></div></td></tr> : paginatedPassports.map(item => {
                    const status = getStatus(item); const isInsurance = (item.docType || "PASSPORT") === "INSURANCE";
                    const holderName = isInsurance ? (item.memberName || `${item.firstName || ""} ${item.lastName || ""}`.trim()) : `${item.firstName || item.givenNames || ""} ${item.lastName || item.surname || ""}`.trim();
                    const docNumber = isInsurance ? item.policyNo : item.passportNo;
                    return <tr key={item.id}>
                      <td style={{ padding: '8px' }}>{isPreviewable(item.previewImage) ? <img src={item.previewImage} alt="" className="table-thumb" style={{ width: '60px', height: '40px', objectFit: 'cover', borderRadius: '6px', border: '2px solid var(--purple-light)', boxShadow: '0 2px 8px var(--purple-glow)' }} onError={e => { e.currentTarget.style.opacity = "0.2"; }} /> : <div className="table-thumb-placeholder" style={{ width: '60px', height: '40px', background: 'var(--bg-main)', borderRadius: '6px', display: 'grid', placeItems: 'center', color: 'var(--purple-mid)' }}><i className={isInsurance ? "fa-solid fa-id-card-clip" : "fa-solid fa-passport"}></i></div>}</td>
                      <td><span className={`badge ${isInsurance ? "badge-info" : "badge-primary"}`}>{isInsurance ? "INSURANCE" : "PASSPORT"}</span></td><td style={{ fontWeight: 600 }}>{holderName || "-"}</td><td style={{ fontFamily: "monospace" }}>{docNumber || "-"}</td><td>{(isInsurance ? item.provider : item.nationality) || "-"}</td><td>{item.dob ? formatDateString(item.dob) : "-"}</td><td>{item.doe ? formatDateString(item.doe) : (item.effectiveDate ? formatDateString(item.effectiveDate) : "-")}</td><td><span className={`badge ${status.cls}`}>{status.text}</span></td><td><div className="table-actions"><button className="btn-icon btn-view" title="View Details" onClick={() => { setActiveModalRecord(item); setActiveTab('VIEW_RECORD'); }}><i className="fa-solid fa-eye"></i></button><button className="btn-icon btn-edit" title="Edit" onClick={() => handleEdit(item)}><i className="fa-solid fa-pen"></i></button><button className="btn-icon btn-delete" title="Delete" onClick={() => handleDelete(item.id)}><i className="fa-solid fa-trash"></i></button></div></td>
                    </tr>;
                  })}
                  </tbody>
                </table>
              </div>
              <div className="pagination" style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '15px', alignItems: 'center' }}><button className="btn-pagination" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}>Prev</button><span className="pagination-info" style={{ fontWeight: 600 }}>Page {currentPage} of {Math.max(1, totalPages)}</span><button className="btn-pagination" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>Next</button></div>
            </div>
          </main>)}

        {activeTab === "VIEW_RECORD" && activeModalRecord && (
          <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => { setActiveModalRecord(null); setActiveTab("REGISTRY"); }}>
            <div className="modal-content" style={{ background: "var(--bg-main)", borderRadius: "12px", maxWidth: "800px", width: "90%", maxHeight: "90vh", overflowY: "auto", padding: "24px", boxShadow: "0 8px 30px rgba(0,0,0,0.2)" }} onClick={e => e.stopPropagation()}>

{(() => { const rec = activeModalRecord;
          const isPassportDoc = (rec.docType || "PASSPORT") !== "INSURANCE";
          const status = getStatus(rec);
          let rows = [];
          if (isPassportDoc) {
            rows = [
              ["Passport Number", rec.passportNo], ["Issuing Country", rec.issuingCountry], ["First Name", rec.firstName || rec.givenNames], ["Last Name", rec.lastName || rec.surname], ["Nationality", rec.nationality], ["Gender", rec.sex], ["Date of Birth", rec.dob ? formatDateString(rec.dob) : ""], ["Place of Birth", rec.placeOfBirth], ["Date of Issue", rec.issueDate ? formatDateString(rec.issueDate) : ""], ["Date of Expiry", rec.doe ? formatDateString(rec.doe) : ""], ["Place of Issue", rec.placeOfIssue], ["Old Passport No.", rec.oldPassportNo], ["File No.", rec.fileNo], ["Address", rec.address], ["Father's Name", rec.fatherName], ["Mother's Name", rec.motherName], ["Spouse Name", rec.spouseName], ["Status", status.text]
            ];
          } else {
            rows = [
              ["Insurance Type", rec.insuranceType], ["Policy Number", rec.policyNo], ["Provider", rec.provider], ["Member Name", rec.memberName], ["Group No.", rec.groupNo], ["Date of Birth", rec.dob ? formatDateString(rec.dob) : ""], ["Effective Date", rec.effectiveDate ? formatDateString(rec.effectiveDate) : ""], ["Expiry Date", rec.doe ? formatDateString(rec.doe) : ""], ["Phone", rec.phone], ["Email", rec.email], ["Address", rec.address], ["Status", status.text]
            ];
            if (rec.insuranceType === "HEALTH") {
              rows.push(["Health Card No.", rec.healthCardNo], ["TPA", rec.tpa], ["Network Hospital", rec.networkHospital], ["Copay %", rec.copayPercentage], ["Sum Insured", rec.sumInsured], ["Room Rent Limit", rec.roomRentLimit], ["Hosp. Limit", rec.hospitalizationLimit], ["Waiting Period", rec.waitingPeriod], ["Pre-Existing Dis.", rec.preExistingDisease]);
            } else if (rec.insuranceType === "MOTOR") {
              rows.push(["Vehicle No.", rec.vehicleNo], ["Registration No.", rec.registrationNo], ["Vehicle Type", rec.vehicleType], ["Make", rec.make], ["Model", rec.model], ["Variant", rec.variant], ["Engine No.", rec.engineNo], ["Chassis No.", rec.chassisNo], ["IDV", rec.idv], ["Year", rec.manufacturingYear], ["NCB %", rec.ncb], ["Fuel Type", rec.fuelType]);
            } else if (rec.insuranceType === "LIFE") {
              rows.push(["Life Assured", rec.lifeAssured], ["Nominee", rec.nomineeName], ["Maturity Date", rec.maturityDate ? formatDateString(rec.maturityDate) : ""], ["Death Benefit", rec.deathBenefit], ["Maturity Benefit", rec.maturityBenefit], ["Premium", rec.premium], ["Term (Years)", rec.policyTermYears]);
            } else if (rec.insuranceType === "TRAVEL") {
              rows.push(["Start Date", rec.travelStartDate ? formatDateString(rec.travelStartDate) : ""], ["End Date", rec.travelEndDate ? formatDateString(rec.travelEndDate) : ""], ["Destination", rec.destination], ["Departure", rec.departureCountry], ["Arrival", rec.arrivalCountry], ["Trip Type", rec.tripType], ["Travellers", rec.travellerCount]);
            }
          }

          const handledKeys = new Set(["id", "createdAt", "docType", "previewImage", "passportNo", "issuingCountry", "firstName", "givenNames", "lastName", "surname", "nationality", "sex", "dob", "placeOfBirth", "issueDate", "doe", "placeOfIssue", "oldPassportNo", "fileNo", "address", "fatherName", "motherName", "spouseName", "insuranceType", "policyNo", "provider", "memberName", "groupNo", "effectiveDate", "phone", "email", "healthCardNo", "tpa", "networkHospital", "copayPercentage", "sumInsured", "roomRentLimit", "hospitalizationLimit", "waitingPeriod", "preExistingDisease", "vehicleNo", "registrationNo", "vehicleType", "make", "model", "variant", "engineNo", "chassisNo", "idv", "manufacturingYear", "ncb", "fuelType", "lifeAssured", "nomineeName", "maturityDate", "deathBenefit", "maturityBenefit", "premium", "policyTermYears", "travelStartDate", "travelEndDate", "destination", "departureCountry", "arrivalCountry", "tripType", "travellerCount"]);
          const extraRows = [];
          Object.keys(rec).forEach(key => {
            if (!handledKeys.has(key) && rec[key] && rec[key].toString().trim() !== "") {
              const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
              extraRows.push([label, rec[key]]);
            }
          });

          return (
            <main>
              <div className="panel">
                <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h2 className="panel-title"><i className={isPassportDoc ? "fa-solid fa-passport" : "fa-solid fa-id-card-clip"}></i> {isPassportDoc ? "Passport Details" : "Insurance Card Details"}</h2>
                    <p className="panel-subtitle">Full record view and extracted information.</p>
                  </div>
                  <button className="btn btn-secondary" onClick={() => { setActiveModalRecord(null); setActiveTab("REGISTRY"); }}><i className="fa-solid fa-arrow-left"></i> Back to Registry</button>
                </div>
                <div style={{ padding: '32px' }}>
                  {isPreviewable(rec.previewImage) && <img src={rec.previewImage} alt="Document" className="passport-preview-img" style={{ marginBottom: "30px", maxWidth: "600px", border: "1px solid var(--border)" }} onError={e => { e.currentTarget.style.display = "none"; }} />}

                  <div className="form-row">
                    {rows.map(([label, value], idx) => <div className="form-group" style={{ flex: '1 1 30%', minWidth: '250px' }} key={idx}><label>{label}</label><div className="form-control" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-light)', padding: '12px', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontWeight: 500 }}>{value || "-"}</div></div>)}
                  </div>

                  {extraRows.length > 0 && (
                    <div style={{ marginTop: '30px' }}>
                      <h4 className="section-divider-title" style={{ fontSize: "1rem", marginBottom: "16px" }}><i className="fa-solid fa-plus-circle"></i> Additional Extracted Fields</h4>
                      <div className="form-row">
                        {extraRows.map(([label, value], idx) => <div className="form-group" style={{ flex: '1 1 30%', minWidth: '250px' }} key={`extra-${idx}`}><label>{label}</label><div className="form-control" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-light)', padding: '12px', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontWeight: 500 }}>{value || "-"}</div></div>)}
                      </div>
                    </div>
                  )}

                  {isPassportDoc && (
                    <div style={{ marginTop: '30px', padding: '20px', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                      <h4 style={{ marginBottom: '12px', color: 'var(--text-secondary)', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em' }}><i className="fa-solid fa-barcode"></i> Machine Readable Zone (MRZ)</h4>
                      <div className="mrz-font" style={{ fontSize: '16px', letterSpacing: '2px', color: 'var(--text-primary)' }}>{getMRZLine1(rec)}<br />{getMRZLine2(rec)}</div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '12px', marginTop: '32px', justifyContent: 'flex-start', paddingTop: '24px', borderTop: '1px solid var(--border)' }}>
                    <button className="btn btn-primary" onClick={() => { handleEdit(rec); setActiveModalRecord(null); }}><i className="fa-solid fa-pen"></i> Edit Record</button>
                    <button className="btn btn-secondary" style={{ borderColor: 'var(--rose)', color: 'var(--rose)' }} onClick={() => { handleDelete(rec.id); setActiveModalRecord(null); setActiveTab("REGISTRY"); }}><i className="fa-solid fa-trash"></i> Delete</button>
                  </div>
                </div>
              </div>
            </main>
          );
        })()}
        </div>
      </div>
    )} {/* end VIEW_RECORD */}



        <div className={`side-drawer-overlay ${isSidebarOpen ? "open" : ""}`} onClick={() => setIsSidebarOpen(false)}></div>
        <div className={`side-drawer ${isSidebarOpen ? "open" : ""}`}><div className="side-drawer-header"><h3><i className="fa-solid fa-filter"></i> {getFilterLabel(sidebarFilterMode)} ({sidebarPassports.length})</h3><button className="close-drawer-btn" onClick={() => setIsSidebarOpen(false)}><i className="fa-solid fa-xmark"></i></button></div>
          <div className="side-drawer-content">
            <div className="drawer-list">{sidebarPassports.length === 0 ? <p className="empty-drawer">No records in this category.</p> : sidebarPassports.map(item => { const status = getStatus(item); const isInsurance = (item.docType || "PASSPORT") === "INSURANCE"; const holderName = isInsurance ? (item.memberName || `${item.firstName || ""} ${item.lastName || ""}`.trim()) : `${item.firstName || item.givenNames || ""} ${item.lastName || item.surname || ""}`.trim(); const docNumber = isInsurance ? item.policyNo : item.passportNo; return <div className="drawer-card" key={item.id} onClick={() => setActiveModalRecord(item)}><div className="drawer-card-header"><i className={isInsurance ? "fa-solid fa-id-card-clip" : "fa-solid fa-passport"}></i> {docNumber || "No number"}</div><h4>{holderName || "Unnamed Record"}</h4><p className="drawer-expiry">{item.doe ? `Expiry: ${formatDateString(item.doe)}` : ""}</p><span className={`badge ${status.cls}`} style={{ marginTop: '8px' }}>{status.text}</span></div>; })}</div>
          </div>
        </div>
      </div>
    </div>
  );
}     