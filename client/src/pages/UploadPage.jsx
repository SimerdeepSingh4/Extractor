import React, { useState, useEffect, useRef } from "react";
import FileUploadZone from "../components/upload/FileUploadZone";
import DocumentPreview from "../components/upload/DocumentPreview";
import OcrProgressBar from "../components/upload/OcrProgressBar";
import VerificationForm from "../components/upload/VerificationForm";

import * as api from "../services/api";
import { generateMockPassport } from "../utils/mockGenerator";
import {
  EMPTY_FORM,
  UPPERCASE_FIELDS,
  TITLECASE_FIELDS,
  toTitleCase,
  cleanRelativeName,
  NON_PREVIEWABLE
} from "../utils/constants";
import { validateDocumentForm } from "../utils/validation";
import { applyProperNameHandling } from "../utils/names";

export default function UploadPage({
  editingRecord,
  onClearEdit,
  onRecordSaved,
  addToast
}) {
  const [documentType, setDocumentType] = useState("PASSPORT");
  const [isScanning, setIsScanning] = useState(false);
  const [ocrProgressText, setOcrProgressText] = useState("Readying Engine...");
  const [ocrProgressPercent, setOcrProgressPercent] = useState(0);
  const [showOcrProgress, setShowOcrProgress] = useState(false);
  const [previewImage, setPreviewImage] = useState("");
  const [formState, setFormState] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [formErrors, setFormErrors] = useState({});

  const fileInputRef = useRef(null);
  const intervalRef = useRef(null);

  // Sync incoming record to edit
  const [prevEditingRecordId, setPrevEditingRecordId] = useState(editingRecord?.id || null);
  if (editingRecord && editingRecord.id !== prevEditingRecordId) {
    setPrevEditingRecordId(editingRecord.id);
    const dType = editingRecord.docType || "PASSPORT";
    setDocumentType(dType);
    const fName = editingRecord.firstName || editingRecord.givenNames || "";
    const lName = editingRecord.lastName || editingRecord.surname || "";
    const mName = editingRecord.memberName || (fName || lName ? `${fName} ${lName}`.trim() : "");
    setFormState({
      ...EMPTY_FORM,
      ...editingRecord,
      docType: dType,
      lastName: lName,
      firstName: fName,
      memberName: mName,
      fatherName: cleanRelativeName((editingRecord.fatherName || "").replace(/\bKgarwal\b/gi, "Agarwal")),
      motherName: cleanRelativeName((editingRecord.motherName || "").replace(/\bKgarwal\b/gi, "Agarwal")),
      spouseName: cleanRelativeName(editingRecord.spouseName || "")
    });
    setEditId(editingRecord.id);
    setPreviewImage(editingRecord.previewImage || "");
  }

  useEffect(() => {
    if (editingRecord) {
      document.getElementById("details-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [editingRecord]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleInputChange = (e) => {
    let { name, value } = e.target;
    if (UPPERCASE_FIELDS.has(name)) value = value.toUpperCase();
    else if (TITLECASE_FIELDS.has(name)) value = toTitleCase(value);

    if (formErrors[name]) {
      setFormErrors(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }

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
    setEditId(null);
    setPreviewImage("");
    setShowOcrProgress(false);
    setFormErrors({});
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (onClearEdit) onClearEdit();
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
          if (prev === "Initializing Extraction Engine...") {
            return files.length > 1 ? "Extracting text from multiple files..." : "Extracting text from document...";
          }
          if (prev.startsWith("Extracting text")) return "Parsing document fields...";
          return "Finalizing extraction...";
        });
      }, 700);

      let resData;
      if (files.length === 1) {
        resData = await api.scanSingle(files[0], documentType);
      } else {
        resData = await api.scanMulti(files, documentType);
      }

      if (intervalRef.current) clearInterval(intervalRef.current);

      if (resData.success) {
        setOcrProgressPercent(100);
        setOcrProgressText("Extraction complete! (v2)");

        if (files.length === 1) {
          setEditId(null);
          if (onClearEdit) onClearEdit();
          const info = resData.data || {};
          const detectedDocType = info.docType || documentType;
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
            spouseName: cleanRelativeName(info.spouseName || "")
          });

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

          const mergedInfo = { ...EMPTY_FORM, docType: "" };
          let detectedDocType = documentType;

          results.forEach(r => {
            const info = r.data || {};
            if (info.docType) detectedDocType = info.docType;
            Object.keys(info).forEach(key => {
              if (info[key] && !mergedInfo[key]) mergedInfo[key] = info[key];
            });
          });

          const { firstName: cleanedMergedFirst, lastName: cleanedMergedLast, memberName: mergedMemberName } =
            applyProperNameHandling(mergedInfo, detectedDocType);

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
            spouseName: cleanRelativeName(mergedInfo.spouseName || "")
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
                const { previewImage: _unusedPi, ...cleanDoc } = d;
                await api.createPassport(cleanDoc);
                autoSavedCount++;
              } catch (e) {
                console.warn("Auto save record failed:", e);
              }
            }
          }

          if (autoSavedCount > 0 && onRecordSaved) {
            await onRecordSaved();
          }

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
      addToast(err.message || "OCR upload error. Check backend connections.", "error");
    } finally {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setIsScanning(false);
      setTimeout(() => setShowOcrProgress(false), 1000);
    }
  };

  const processUploadedFiles = (files) => {
    if (!files?.length) return;
    if (files.length === 1) {
      const file = files[0];
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      if (isPdf) {
        setPreviewImage("__PDF__:" + file.name);
      } else if (!NON_PREVIEWABLE.test(file.name) && file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = e => setPreviewImage(e.target.result);
        reader.onerror = () => setPreviewImage("__PROCESSING__");
        reader.readAsDataURL(file);
      } else {
        setPreviewImage("__PROCESSING__");
      }
    } else {
      setPreviewImage(`__MULTI__:${files.length}:${files.map(f => f.name).join(", ")}`);
    }
    runOCRPipeline(files);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    const { valid, errors, fieldErrors } = validateDocumentForm(formState);
    if (!valid) {
      setFormErrors(fieldErrors || {});
      addToast(errors[0] || "Please correct the errors in the form.", "error");
      if (errors.length > 1) {
        setTimeout(() => addToast(`Also check: ${errors.slice(1, 3).join(" | ")}`, "error"), 500);
      }
      return;
    }

    setFormErrors({});

    // The image was only used for parsing data; do not save the actual image in the database
    const { previewImage: _unusedPi, ...recordPayload } = formState;

    try {
      if (editId) {
        await api.updatePassport(editId, recordPayload);
        addToast("Record updated successfully!", "success");
      } else {
        await api.createPassport(recordPayload);
        addToast("Record saved successfully!", "success");
      }
      if (onRecordSaved) await onRecordSaved();
      handleClearForm();
    } catch (err) {
      console.error("Save error:", err);
      addToast(err.message || "Failed to save record.", "error");
    }
  };

  const handleTryDemo = () => {
    generateMockPassport(({ file, preview }) => {
      setPreviewImage(preview);
      runOCRPipeline(file);
    });
  };

  return (
    <main>
      <div className="panel">
        <div className="panel-header intake-header">
          <div>
            <h2 className="panel-title">{editId ? "Edit document" : "Document details"}</h2>
            <p className="panel-subtitle">Choose a document type to get started.</p>
          </div>
        </div>

        <div className="registration-grid-layout">
          <div className="doc-type-segmented-wrapper">
            <div className="doc-type-segmented-control" role="group" aria-label="Select document type">
              <button
                type="button"
                aria-pressed={documentType === "PASSPORT"}
                className={`segmented-tab ${documentType === "PASSPORT" ? "active" : ""}`}
                onClick={() => {
                  setDocumentType("PASSPORT");
                  setFormState(p => ({ ...p, docType: "PASSPORT" }));
                  setFormErrors({});
                }}
              >
                <i className="fa-solid fa-passport"></i>
                <span className="tab-title">Passport</span>
              </button>
              <button
                type="button"
                aria-pressed={documentType === "INSURANCE"}
                className={`segmented-tab ${documentType === "INSURANCE" ? "active" : ""}`}
                onClick={() => {
                  setDocumentType("INSURANCE");
                  setFormState(p => ({ ...p, docType: "INSURANCE" }));
                  setFormErrors({});
                }}
              >
                <i className="fa-solid fa-shield-halved"></i>
                <span className="tab-title">Insurance Policy</span>
              </button>
            </div>
          </div>

          <div className="scan-section-centered">
            <div className="step-heading"><span className="step-number">1</span><div><h3>Source document</h3><p>Upload a clear scan or photograph.</p></div></div>
            {!previewImage && (
              <FileUploadZone
                onFilesSelected={processUploadedFiles}
                fileInputRef={fileInputRef}
                onError={(msg) => addToast(msg, "error")}
              />
            )}

            <DocumentPreview
              previewImage={previewImage}
              isScanning={isScanning}
              onClear={handleClearForm}
            />

            <OcrProgressBar
              show={showOcrProgress}
              progressPercent={ocrProgressPercent}
              progressText={ocrProgressText}
            />

            <div className="demo-trigger-wrapper">
              <button
                type="button"
                className="demo-trigger-btn"
                onClick={handleTryDemo}
              >
                <i className="fa-regular fa-file-lines" aria-hidden="true"></i> Try a sample passport
              </button>
            </div>
            <div className="upload-guidance"><h4>A better scan, fewer corrections.</h4><p>Keep all four corners visible and avoid glare. For a passport, include the full photo page and the two lines of text at the bottom.</p></div>
          </div>

          <VerificationForm
            formState={formState}
            handleInputChange={handleInputChange}
            handleFormSubmit={handleFormSubmit}
            handleClearForm={handleClearForm}
            isScanning={isScanning}
            editId={editId}
            formErrors={formErrors}
          />
        </div>
      </div>
    </main>
  );
}
