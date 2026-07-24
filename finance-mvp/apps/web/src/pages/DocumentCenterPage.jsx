import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import ShareDocumentsModal, { Modal, overlayStyle, labelStyle, inputStyle } from "../components/ShareDocumentsModal";

/* ---------------------------------------------------------------------------
   Personal Document Center
   The single place a user organizes every document (W-2s, tax docs, statements,
   contracts, IDs …) into folders, and the origin of every CPA share. Files
   uploaded elsewhere in the app are registered here too, so this is the one
   source of truth. Sharing produces a secure, revocable link with view-only /
   download scope, optional passcode and expiry, plus a per-share access log.
--------------------------------------------------------------------------- */

const DOC_TYPES = [
  ["W2", "W-2"], ["1099", "1099"], ["TAX_RETURN", "Tax return"], ["STATEMENT", "Statement"],
  ["ID", "ID / KYC"], ["CONTRACT", "Contract"], ["RECEIPT", "Receipt"], ["OTHER", "Other"],
];
const docTypeLabel = (t) => (DOC_TYPES.find(([v]) => v === t)?.[1]) || t || "Other";
const SOURCE_LABEL = { business: "My Business", tax: "Taxes", deal: "Deal Room", realestate: "Real Estate" };

function formatBytes(n) {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
function fmtDate(s) {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
  catch { return s; }
}
function fmtDateTime(s) {
  if (!s) return "";
  try { return new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  catch { return s; }
}

export default function DocumentCenterPage() {
  const [config, setConfig] = useState({ uploadEnabled: false });
  const [summary, setSummary] = useState({ documents: 0, folders: 0, activeShares: 0 });
  const [folders, setFolders] = useState([]);
  const [activeFolder, setActiveFolder] = useState("all"); // "all" | "root" | <folderId>
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [showUpload, setShowUpload] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [editDoc, setEditDoc] = useState(null);
  const [shareDoc, setShareDoc] = useState(null);   // document OR { folder:true, id, name } OR { set:true, documentIds, count }
  const [showShares, setShowShares] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set()); // ids of documents picked for a multi-file share

  const toggleSelected = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3500); };

  const loadFolders = useCallback(async () => {
    const [f, s] = await Promise.all([api.getDocFolders(), api.getDocCenterSummary()]);
    setFolders(f || []);
    setSummary(s || { documents: 0, folders: 0, activeShares: 0 });
  }, []);

  const loadDocuments = useCallback(async (folderSel) => {
    const sel = folderSel ?? activeFolder;
    const params = sel === "all" ? {} : sel === "root" ? { root: true } : { folderId: sel };
    const docs = await api.getDocuments(params);
    setDocuments(docs || []);
  }, [activeFolder]);

  const refresh = useCallback(async (folderSel) => {
    setLoading(true); setError("");
    try {
      await Promise.all([loadFolders(), loadDocuments(folderSel)]);
    } catch (e) {
      setError(e?.message || "Could not load your documents.");
    } finally {
      setLoading(false);
    }
  }, [loadFolders, loadDocuments]);

  useEffect(() => {
    (async () => {
      try { setConfig(await api.getDocCenterConfig()); } catch { /* upload just stays disabled */ }
      await refresh("all");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectFolder = async (sel) => {
    setActiveFolder(sel);
    setLoading(true);
    try { await loadDocuments(sel); } catch (e) { setError(e?.message || "Could not load folder."); }
    finally { setLoading(false); }
  };

  const onCreateFolder = async () => {
    const name = window.prompt("New folder name (e.g. \"2023 Taxes\")");
    if (!name || !name.trim()) return;
    try { await api.createDocFolder(name.trim(), activeFolder !== "all" && activeFolder !== "root" ? activeFolder : null); await loadFolders(); flash("Folder created."); }
    catch (e) { setError(e?.message || "Could not create folder."); }
  };
  const onRenameFolder = async (f) => {
    const name = window.prompt("Rename folder", f.name);
    if (!name || !name.trim() || name.trim() === f.name) return;
    try { await api.renameDocFolder(f.id, name.trim()); await loadFolders(); }
    catch (e) { setError(e?.message || "Could not rename folder."); }
  };
  const onDeleteFolder = async (f) => {
    if (!window.confirm(`Delete the folder "${f.name}"? It must be empty.`)) return;
    try {
      await api.deleteDocFolder(f.id);
      if (String(activeFolder) === String(f.id)) await selectFolder("all");
      await loadFolders(); flash("Folder deleted.");
    } catch (e) { setError(e?.message || "Could not delete folder (is it empty?)."); }
  };

  const onOpen = async (d) => {
    try {
      if (d.isFile) {
        const url = await api.openDocument(d.id);
        window.open(url, "_blank", "noopener");
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else if (d.url) {
        window.open(d.url, "_blank", "noopener");
      }
    } catch (e) { setError(e?.message || "Could not open the document."); }
  };

  const onDelete = async (d) => {
    if (!window.confirm(`Delete "${d.label}"? This cannot be undone.`)) return;
    try { await api.deleteDocument(d.id); await refresh(); flash("Document deleted."); }
    catch (e) { setError(e?.message || "This document is currently shared — revoke the share first."); }
  };

  const currentFolderName =
    activeFolder === "all" ? "All documents"
      : activeFolder === "root" ? "Unfiled"
        : (folders.find((f) => String(f.id) === String(activeFolder))?.name || "Folder");

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Documents</div>
          <div className="page-subtitle">Your personal Document Center — organize, store and securely share</div>
        </div>
        <div className="page-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowShares(true)}>
            <i className="ti ti-users"></i> Shared ({summary.activeShares})
          </button>
          <button className={`btn btn-sm ${selectMode ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}>
            <i className="ti ti-checkbox"></i> {selectMode ? "Cancel" : "Select"}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowLink(true)}>
            <i className="ti ti-link"></i> Add link
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowUpload(true)}
                  title={config.uploadEnabled ? "" : "File upload isn't configured on this environment — add a link instead"}>
            <i className="ti ti-upload"></i> Upload
          </button>
        </div>
      </div>

      {error && <div className="card" style={{ borderColor: "var(--tv-negative)", marginBottom: 12, color: "var(--tv-negative)" }}><i className="ti ti-alert-triangle"></i> {error}</div>}
      {msg && <div className="card" style={{ borderColor: "var(--tv-positive)", marginBottom: 12, color: "var(--tv-positive)" }}><i className="ti ti-check"></i> {msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 240px) 1fr", gap: 16, alignItems: "start" }}>
        {/* Folder rail */}
        <div className="card" style={{ padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <strong style={{ fontSize: 13, color: "var(--tv-text-muted)" }}>FOLDERS</strong>
            <button className="btn btn-secondary btn-sm" onClick={onCreateFolder} title="New folder" style={{ padding: "2px 8px" }}>
              <i className="ti ti-folder-plus"></i>
            </button>
          </div>
          <FolderRow icon="ti-inbox" label="All documents" count={summary.documents} active={activeFolder === "all"} onClick={() => selectFolder("all")} />
          <FolderRow icon="ti-file-dots" label="Unfiled" active={activeFolder === "root"} onClick={() => selectFolder("root")} />
          <div style={{ height: 1, background: "var(--tv-border, rgba(0,0,0,.08))", margin: "8px 0" }} />
          {folders.length === 0 && <div style={{ fontSize: 12, color: "var(--tv-text-muted)", padding: "6px 4px" }}>No folders yet.</div>}
          {folders.map((f) => (
            <FolderRow key={f.id} icon="ti-folder" label={f.name} count={f.documentCount}
                       active={String(activeFolder) === String(f.id)}
                       onClick={() => selectFolder(f.id)}
                       onShare={() => setShareDoc({ folder: true, id: f.id, name: f.name })}
                       onRename={() => onRenameFolder(f)} onDelete={() => onDeleteFolder(f)} />
          ))}
        </div>

        {/* Documents */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h2 className="page-title" style={{ fontSize: 18, margin: 0 }}>{currentFolderName}</h2>
            <span style={{ fontSize: 13, color: "var(--tv-text-muted)" }}>{documents.length} item{documents.length === 1 ? "" : "s"}</span>
          </div>

          {loading ? (
            <div className="empty-state"><i className="ti ti-loader spin"></i><p>Loading…</p></div>
          ) : documents.length === 0 ? (
            <div className="empty-state">
              <i className="ti ti-folder-open"></i>
              <p>No documents here yet. Upload a file or add a link to get started.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {documents.map((d) => (
                <DocRow key={d.id} d={d} folders={folders}
                        selectMode={selectMode} checked={selected.has(d.id)}
                        onToggleSelect={() => toggleSelected(d.id)}
                        onOpen={() => onOpen(d)} onShare={() => setShareDoc(d)}
                        onEdit={() => setEditDoc(d)} onDelete={() => onDelete(d)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {selectMode && (
        <div className="card" style={{ position: "sticky", bottom: 12, marginTop: 12, display: "flex",
          alignItems: "center", gap: 12, boxShadow: "0 6px 24px rgba(0,0,0,.12)" }}>
          <strong>{selected.size} selected</strong>
          <span style={{ flex: 1, fontSize: 13, color: "var(--tv-text-muted)" }}>Share several documents together as one secure link.</span>
          <button className="btn btn-secondary btn-sm" onClick={exitSelect}>Cancel</button>
          <button className="btn btn-primary btn-sm" disabled={selected.size === 0}
                  onClick={() => setShareDoc({ set: true, documentIds: [...selected], count: selected.size })}>
            <i className="ti ti-share"></i> Share {selected.size} selected
          </button>
        </div>
      )}

      {showUpload && (
        <UploadModal uploadEnabled={config.uploadEnabled} folders={folders} defaultFolder={activeFolder}
                     onClose={() => setShowUpload(false)}
                     onDone={async () => { setShowUpload(false); await refresh(); flash("Document uploaded."); }} />
      )}
      {showLink && (
        <LinkModal folders={folders} defaultFolder={activeFolder}
                   onClose={() => setShowLink(false)}
                   onDone={async () => { setShowLink(false); await refresh(); flash("Link added."); }} />
      )}
      {editDoc && (
        <EditModal doc={editDoc} folders={folders}
                   onClose={() => setEditDoc(null)}
                   onDone={async () => { setEditDoc(null); await refresh(); flash("Document updated."); }} />
      )}
      {shareDoc && (
        <ShareDocumentsModal target={shareDoc}
                    onClose={() => { const wasSet = shareDoc?.set; setShareDoc(null); if (wasSet) exitSelect(); }}
                    onCreated={async () => { await loadFolders(); flash("Share link created."); }} />
      )}
      {showShares && (
        <SharesPanel onClose={() => { setShowShares(false); loadFolders(); refresh(); }} />
      )}
    </div>
  );
}

function FolderRow({ icon, label, count, active, onClick, onShare, onRename, onDelete }) {
  return (
    <div onClick={onClick}
         className="doc-folder-row"
         style={{
           display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8,
           cursor: "pointer", background: active ? "var(--tv-forest-tint, rgba(45,90,61,.10))" : "transparent",
           color: active ? "var(--tv-forest)" : "inherit", fontWeight: active ? 600 : 400,
         }}>
      <i className={`ti ${icon}`}></i>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14 }}>{label}</span>
      {count != null && <span className="badge" style={{ fontSize: 11 }}>{count}</span>}
      {(onShare || onRename || onDelete) && (
        <span style={{ display: "flex", gap: 2 }} onClick={(e) => e.stopPropagation()}>
          {onShare && <button className="btn btn-secondary btn-sm" style={{ padding: "1px 5px" }} title="Share folder" onClick={onShare}><i className="ti ti-share"></i></button>}
          {onRename && <button className="btn btn-secondary btn-sm" style={{ padding: "1px 5px" }} title="Rename" onClick={onRename}><i className="ti ti-pencil"></i></button>}
          {onDelete && <button className="btn btn-secondary btn-sm" style={{ padding: "1px 5px" }} title="Delete" onClick={onDelete}><i className="ti ti-trash"></i></button>}
        </span>
      )}
    </div>
  );
}

function DocRow({ d, selectMode, checked, onToggleSelect, onOpen, onShare, onEdit, onDelete }) {
  const canOpen = d.isFile || !!d.url;
  return (
    <div className="card" onClick={selectMode ? onToggleSelect : undefined}
         style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 12, margin: 0,
           cursor: selectMode ? "pointer" : "default",
           borderColor: selectMode && checked ? "var(--tv-forest)" : undefined,
           background: selectMode && checked ? "var(--tv-forest-tint, rgba(45,90,61,.08))" : undefined }}>
      {selectMode && (
        <input type="checkbox" checked={checked} readOnly
               style={{ width: 18, height: 18, accentColor: "var(--tv-forest)" }} />
      )}
      <i className={`ti ${d.isFile ? "ti-file-text" : "ti-link"}`} style={{ fontSize: 22, color: "var(--tv-forest)" }}></i>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button onClick={!selectMode && canOpen ? onOpen : undefined}
                  style={{ background: "none", border: "none", padding: 0, cursor: !selectMode && canOpen ? "pointer" : "default",
                           fontWeight: 600, fontSize: 15, color: "inherit", textAlign: "left" }}>
            {d.label}
          </button>
          <span className="badge">{docTypeLabel(d.docType)}</span>
          {d.sourceService && <span className="badge" style={{ background: "var(--tv-forest-tint, rgba(45,90,61,.12))", color: "var(--tv-forest)" }}>{SOURCE_LABEL[d.sourceService] || d.sourceService}</span>}
          {d.shared && <span className="badge" style={{ background: "var(--tv-gold-pale)", color: "var(--tv-gold, #b8860b)" }}><i className="ti ti-users"></i> Shared</span>}
        </div>
        <div style={{ fontSize: 12, color: "var(--tv-text-muted)", marginTop: 2 }}>
          {d.isFile ? (d.originalFilename || "File") : "Link"}
          {d.sizeBytes ? ` · ${formatBytes(d.sizeBytes)}` : ""} · Added {fmtDate(d.createdAt)}
          {d.note ? ` · ${d.note}` : ""}
        </div>
      </div>
      {!selectMode && (
        <div style={{ display: "flex", gap: 6 }}>
          {canOpen && <button className="btn btn-secondary btn-sm" onClick={onOpen} title="Open"><i className="ti ti-external-link"></i></button>}
          <button className="btn btn-secondary btn-sm" onClick={onShare} title="Share"><i className="ti ti-share"></i></button>
          <button className="btn btn-secondary btn-sm" onClick={onEdit} title="Edit / move"><i className="ti ti-pencil"></i></button>
          <button className="btn btn-secondary btn-sm" onClick={onDelete} title="Delete"><i className="ti ti-trash"></i></button>
        </div>
      )}
    </div>
  );
}



function FolderSelect({ value, onChange, folders }) {
  return (
    <select style={inputStyle} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Unfiled (no folder)</option>
      {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
    </select>
  );
}
function TypeSelect({ value, onChange }) {
  return (
    <select style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)}>
      {DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
const defaultFolderValue = (sel) => (sel !== "all" && sel !== "root" ? sel : "");

function UploadModal({ uploadEnabled, folders, defaultFolder, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [label, setLabel] = useState("");
  const [docType, setDocType] = useState("OTHER");
  const [folderId, setFolderId] = useState(defaultFolderValue(defaultFolder));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!file) { setErr("Choose a file first."); return; }
    setBusy(true); setErr("");
    try { await api.uploadDocument(file, { label, docType, note, folderId }); onDone(); }
    catch (e) { setErr(e?.message || "Upload failed."); setBusy(false); }
  };

  return (
    <Modal title="Upload a document" subtitle="Stored securely and added to your Document Center" onClose={onClose}>
      {!uploadEnabled && (
        <div className="card" style={{ borderColor: "var(--tv-gold, #b8860b)", padding: 10, fontSize: 13, marginBottom: 8 }}>
          File upload isn’t configured on this environment. You can still add a link instead.
        </div>
      )}
      <label style={labelStyle}>File</label>
      <input type="file" onChange={(e) => { const f = e.target.files?.[0] || null; setFile(f); if (f && !label) setLabel(f.name); }} disabled={!uploadEnabled} />
      <label style={labelStyle}>Name</label>
      <input style={inputStyle} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. W-2 2023" />
      <label style={labelStyle}>Type</label>
      <TypeSelect value={docType} onChange={setDocType} />
      <label style={labelStyle}>Folder</label>
      <FolderSelect value={folderId} onChange={setFolderId} folders={folders} />
      <label style={labelStyle}>Note (optional)</label>
      <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} />
      {err && <div style={{ color: "var(--tv-negative)", fontSize: 13, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy || !uploadEnabled}>{busy ? "Uploading…" : "Upload"}</button>
      </div>
    </Modal>
  );
}

function LinkModal({ folders, defaultFolder, onClose, onDone }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [docType, setDocType] = useState("OTHER");
  const [folderId, setFolderId] = useState(defaultFolderValue(defaultFolder));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!label.trim() || !url.trim()) { setErr("A name and a link are required."); return; }
    setBusy(true); setErr("");
    try { await api.addDocumentLink({ label, url, docType, note, folderId }); onDone(); }
    catch (e) { setErr(e?.message || "Could not add link."); setBusy(false); }
  };

  return (
    <Modal title="Add a link" subtitle="Point to a document hosted anywhere (Drive, Dropbox, a data room…)" onClose={onClose}>
      <label style={labelStyle}>Name</label>
      <input style={inputStyle} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Signed lease agreement" />
      <label style={labelStyle}>Link (URL)</label>
      <input style={inputStyle} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      <label style={labelStyle}>Type</label>
      <TypeSelect value={docType} onChange={setDocType} />
      <label style={labelStyle}>Folder</label>
      <FolderSelect value={folderId} onChange={setFolderId} folders={folders} />
      <label style={labelStyle}>Note (optional)</label>
      <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} />
      {err && <div style={{ color: "var(--tv-negative)", fontSize: 13, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Adding…" : "Add link"}</button>
      </div>
    </Modal>
  );
}

function EditModal({ doc, folders, onClose, onDone }) {
  const [label, setLabel] = useState(doc.label || "");
  const [docType, setDocType] = useState(doc.docType || "OTHER");
  const [folderId, setFolderId] = useState(doc.folderId ?? "");
  const [note, setNote] = useState(doc.note || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setBusy(true); setErr("");
    try { await api.updateDocument(doc.id, { label, docType, folderId, note }); onDone(); }
    catch (e) { setErr(e?.message || "Could not update."); setBusy(false); }
  };

  return (
    <Modal title="Edit document" subtitle="Rename, retype, move to a folder or add a note" onClose={onClose}>
      <label style={labelStyle}>Name</label>
      <input style={inputStyle} value={label} onChange={(e) => setLabel(e.target.value)} />
      <label style={labelStyle}>Type</label>
      <TypeSelect value={docType} onChange={setDocType} />
      <label style={labelStyle}>Folder</label>
      <FolderSelect value={folderId} onChange={setFolderId} folders={folders} />
      <label style={labelStyle}>Note</label>
      <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} />
      {err && <div style={{ color: "var(--tv-negative)", fontSize: 13, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </Modal>
  );
}



function SharesPanel({ onClose }) {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accessFor, setAccessFor] = useState(null);
  const [log, setLog] = useState([]);
  const [copiedId, setCopiedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setShares(await api.getDocShares() || []); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const copy = async (s) => {
    try { await navigator.clipboard.writeText(s.link); setCopiedId(s.id); setTimeout(() => setCopiedId(null), 2000); } catch { /* ignore */ }
  };
  const revoke = async (s) => {
    if (!window.confirm("Revoke this share? The recipient's link will stop working immediately.")) return;
    await api.revokeDocShare(s.id); load();
  };
  const remove = async (s) => {
    if (!window.confirm("Delete this share and its access history?")) return;
    await api.deleteDocShare(s.id); load();
  };
  const viewAccess = async (s) => {
    setAccessFor(s);
    try { setLog(await api.getDocShareAccess(s.id) || []); } catch { setLog([]); }
  };

  const statusColor = (st) => st === "active" ? "var(--tv-positive)" : st === "expired" ? "var(--tv-gold, #b8860b)" : "var(--tv-negative)";

  return (
    <Modal title="Shared documents" subtitle="Everything you've shared, who accessed it, and controls to revoke" onClose={onClose} maxWidth={680}>
      {loading ? (
        <div className="empty-state"><i className="ti ti-loader spin"></i><p>Loading…</p></div>
      ) : shares.length === 0 ? (
        <div className="empty-state"><i className="ti ti-share-off"></i><p>You haven't shared any documents yet.</p></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {shares.map((s) => (
            <div key={s.id} className="card" style={{ padding: 12, margin: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <i className={`ti ${s.targetKind === "FOLDER" ? "ti-folder" : s.targetKind === "SET" ? "ti-files" : "ti-file-text"}`}></i>
                    {s.targetLabel}
                    <span className="badge" style={{ color: statusColor(s.status), borderColor: statusColor(s.status) }}>{s.status}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--tv-text-muted)", marginTop: 3 }}>
                    {s.scope === "DOWNLOAD" ? "View + download" : "View-only"}
                    {s.granteeRef ? ` · ${s.granteeRef}` : (s.granteeKind === "CPA" ? " · CPA" : " · Link")}
                    {s.hasPasscode ? " · Passcode" : ""}
                    {s.expiresAt ? ` · Expires ${fmtDate(s.expiresAt)}` : " · No expiry"}
                    {` · ${s.accessCount} view${s.accessCount === 1 ? "" : "s"}`}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {s.status === "active" && <button className="btn btn-secondary btn-sm" onClick={() => copy(s)}><i className="ti ti-copy"></i> {copiedId === s.id ? "Copied!" : "Copy link"}</button>}
                <button className="btn btn-secondary btn-sm" onClick={() => viewAccess(s)}><i className="ti ti-history"></i> Access log</button>
                {s.status === "active" && <button className="btn btn-secondary btn-sm" onClick={() => revoke(s)}><i className="ti ti-ban"></i> Revoke</button>}
                <button className="btn btn-secondary btn-sm" onClick={() => remove(s)}><i className="ti ti-trash"></i> Delete</button>
              </div>

              {accessFor?.id === s.id && (
                <div style={{ marginTop: 10, borderTop: "1px solid var(--tv-border, rgba(0,0,0,.08))", paddingTop: 8 }}>
                  <strong style={{ fontSize: 12, color: "var(--tv-text-muted)" }}>ACCESS LOG</strong>
                  {log.length === 0 ? (
                    <div style={{ fontSize: 13, color: "var(--tv-text-muted)", marginTop: 4 }}>No access yet.</div>
                  ) : (
                    <div style={{ marginTop: 4 }}>
                      {log.map((a, i) => (
                        <div key={i} style={{ fontSize: 12, display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                          <span><i className={`ti ${a.action === "DOWNLOAD" ? "ti-download" : a.action === "DENIED" ? "ti-lock" : "ti-eye"}`}></i> {a.action}</span>
                          <span style={{ color: "var(--tv-text-muted)" }}>{fmtDateTime(a.accessedAt)} · {a.ip}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}
