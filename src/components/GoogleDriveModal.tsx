import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  ExternalLink,
  Eye,
  FileText,
  Folder,
  HardDrive,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  createDriveTextFile,
  deleteDriveFile,
  type DriveFileItem,
  listDriveFiles,
  readDriveFileContent,
  renameDriveFile,
  uploadDriveFile,
} from '../services/googleDrive';
import { GoogleSignInButton } from './GoogleSignInButton';

interface GoogleDriveModalProps {
  open: boolean;
  onClose: () => void;
  user: User | null;
  accessToken: string | null;
  initialQuery?: string;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onAuthExpired: () => void;
}

type PendingMutation =
  | { kind: 'trash'; file: DriveFileItem }
  | { kind: 'delete'; file: DriveFileItem }
  | { kind: 'rename'; file: DriveFileItem; nextName: string };

function formatFileSize(sizeStr?: string): string {
  const bytes = Number(sizeStr);
  if (!sizeStr || Number.isNaN(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFriendlyType(mimeType: string): string {
  if (mimeType === 'application/vnd.google-apps.folder') return 'Folder';
  if (mimeType === 'application/vnd.google-apps.document') return 'Google Doc';
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'Google Sheet';
  if (mimeType === 'application/vnd.google-apps.presentation') return 'Google Slides';
  if (mimeType.startsWith('image/')) return 'Image';
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('text/')) return 'Text';
  return 'File';
}

export const GoogleDriveModal: React.FC<GoogleDriveModalProps> = ({
  open,
  onClose,
  user,
  accessToken,
  initialQuery = '',
  onSignIn,
  onSignOut,
  onAuthExpired,
}) => {
  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [showNoteComposer, setShowNoteComposer] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const [previewFile, setPreviewFile] = useState<{ name: string; content: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ file: DriveFileItem; draft: string } | null>(null);
  const [pendingMutation, setPendingMutation] = useState<PendingMutation | null>(null);
  const [mutating, setMutating] = useState(false);

  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setSearchQuery(initialQuery);
      setErrorMsg(null);
      setStatusMsg(null);
    }
  }, [open, initialQuery]);

  const loadFiles = useCallback(
    async (queryToRun: string) => {
      if (!accessToken) return;
      setLoading(true);
      setErrorMsg(null);
      try {
        const items = await listDriveFiles(accessToken, queryToRun);
        setFiles(items);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to fetch Drive files.';
        if (msg === 'AUTH_EXPIRED') {
          onAuthExpired();
          setErrorMsg('Session expired. Please sign in with Google again.');
        } else {
          setErrorMsg(msg);
        }
      } finally {
        setLoading(false);
      }
    },
    [accessToken, onAuthExpired]
  );

  useEffect(() => {
    if (open && accessToken) {
      void loadFiles(searchQuery);
    }
  }, [open, accessToken, searchQuery, loadFiles]);

  if (!open) return null;

  const handleSignInClick = async () => {
    setSigningIn(true);
    setErrorMsg(null);
    try {
      await onSignIn();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google sign-in could not complete.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleUploadSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !accessToken) return;
    setLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const created = await uploadDriveFile(accessToken, file);
      setFiles((prev) => [created, ...prev]);
      setStatusMsg(`Uploaded "${created.name}" to Google Drive.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      if (msg === 'AUTH_EXPIRED') onAuthExpired();
      else setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !noteTitle.trim()) return;
    setSavingNote(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const created = await createDriveTextFile(accessToken, noteTitle, noteContent);
      setFiles((prev) => [created, ...prev]);
      setNoteTitle('');
      setNoteContent('');
      setShowNoteComposer(false);
      setStatusMsg(`Saved "${created.name}" to Google Drive.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save note.';
      if (msg === 'AUTH_EXPIRED') onAuthExpired();
      else setErrorMsg(msg);
    } finally {
      setSavingNote(false);
    }
  };

  const handlePreview = async (file: DriveFileItem) => {
    if (!accessToken) return;
    setErrorMsg(null);
    try {
      const text = await readDriveFileContent(accessToken, file.id, file.mimeType);
      setPreviewFile({ name: file.name, content: text.slice(0, 4000) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Preview unavailable.';
      if (msg === 'AUTH_EXPIRED') onAuthExpired();
      else setErrorMsg(msg);
    }
  };

  const handleConfirmMutation = async () => {
    if (!pendingMutation || !accessToken) return;
    setMutating(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      if (pendingMutation.kind === 'rename') {
        const updated = await renameDriveFile(
          accessToken,
          pendingMutation.file.id,
          pendingMutation.nextName
        );
        setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
        setStatusMsg(`Renamed file to "${updated.name}".`);
        setRenameTarget(null);
      } else {
        const permanent = pendingMutation.kind === 'delete';
        await deleteDriveFile(accessToken, pendingMutation.file.id, permanent);
        setFiles((prev) => prev.filter((f) => f.id !== pendingMutation.file.id));
        setStatusMsg(
          permanent
            ? `Permanently deleted "${pendingMutation.file.name}".`
            : `Moved "${pendingMutation.file.name}" to Trash.`
        );
      }
      setPendingMutation(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Drive action failed.';
      if (msg === 'AUTH_EXPIRED') onAuthExpired();
      else setErrorMsg(msg);
    } finally {
      setMutating(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Google Drive Workspace"
      data-testid="google-drive-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-sky-500/25 bg-[#081020] text-slate-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-sky-500/15 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300">
              <HardDrive className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-white">Google Drive</h2>
              <p className="text-xs text-slate-400">
                {user?.email ? `Connected as ${user.email}` : 'Browse, search & manage your files'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {accessToken && (
              <button
                type="button"
                onClick={() => void onSignOut()}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sign out</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Google Drive"
              className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMsg && (
            <p
              role="alert"
              className="rounded-xl border border-rose-500/35 bg-rose-950/50 px-3.5 py-2.5 text-xs text-rose-200"
            >
              {errorMsg}
            </p>
          )}
          {statusMsg && (
            <p
              role="status"
              className="rounded-xl border border-emerald-500/35 bg-emerald-950/40 px-3.5 py-2 text-xs text-emerald-200"
            >
              {statusMsg}
            </p>
          )}

          {!accessToken ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-sky-500/15 bg-[#050A14] px-6 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-300">
                <HardDrive className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="mt-4 font-display text-base font-semibold text-white">
                Connect your Google Drive
              </h3>
              <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-400">
                Sign in with your Google account so your assistant can list, search, read, upload,
                and organize your Drive files with your explicit permission.
              </p>
              <div className="mt-5">
                <GoogleSignInButton onClick={() => void handleSignInClick()} loading={signingIn} />
              </div>
            </div>
          ) : (
            <>
              {/* Search & Quick Actions */}
              <div className="flex flex-wrap items-center gap-2">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void loadFiles(searchQuery);
                  }}
                  className="relative flex-1 min-w-[200px]"
                >
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    data-testid="drive-search-input"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search Google Drive files..."
                    className="min-h-[40px] w-full rounded-xl border border-slate-700 bg-[#050A14] pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                  />
                </form>

                <button
                  type="button"
                  onClick={() => void loadFiles(searchQuery)}
                  disabled={loading}
                  aria-label="Refresh Drive files"
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                  <span>Refresh</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowNoteComposer((v) => !v)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>New Note</span>
                </button>

                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-sky-500/35 bg-sky-500/15 px-3 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-500/25"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Upload</span>
                </button>
                <input
                  ref={uploadInputRef}
                  type="file"
                  onChange={(e) => void handleUploadSelected(e)}
                  className="hidden"
                />
              </div>

              {/* New Note Form */}
              {showNoteComposer && (
                <form
                  onSubmit={(e) => void handleCreateNote(e)}
                  className="space-y-2.5 rounded-2xl border border-sky-500/20 bg-[#050A14] p-4"
                >
                  <input
                    type="text"
                    required
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    placeholder="Note title (e.g. Meeting Summary)"
                    className="min-h-[38px] w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-sky-400 focus:outline-none"
                  />
                  <textarea
                    rows={3}
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="Write content to save directly in Google Drive..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-sky-400 focus:outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowNoteComposer(false)}
                      className="min-h-[34px] rounded-lg px-3 py-1 text-xs text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingNote}
                      className="min-h-[34px] rounded-lg bg-sky-600 px-3.5 py-1 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
                    >
                      {savingNote ? 'Saving...' : 'Save to Drive'}
                    </button>
                  </div>
                </form>
              )}

              {/* Preview Pane */}
              {previewFile && (
                <div className="rounded-2xl border border-sky-500/20 bg-[#050A14] p-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <p className="text-xs font-semibold text-sky-300">{previewFile.name}</p>
                    <button
                      type="button"
                      onClick={() => setPreviewFile(null)}
                      aria-label="Close preview"
                      className="text-slate-400 hover:text-white"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <pre className="mt-2.5 max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-200">
                    {previewFile.content || '(Empty file)'}
                  </pre>
                </div>
              )}

              {/* File List */}
              <div className="space-y-2">
                {loading && files.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-400">Loading your Drive files...</p>
                ) : files.length === 0 ? (
                  <p className="rounded-2xl border border-slate-800 bg-[#050A14] py-8 text-center text-xs text-slate-400">
                    No matching files found in Google Drive.
                  </p>
                ) : (
                  files.map((file) => {
                    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                    const canPreview =
                      file.mimeType.startsWith('text/') ||
                      file.mimeType === 'application/vnd.google-apps.document' ||
                      file.mimeType === 'application/vnd.google-apps.spreadsheet';
                    const isRenaming = renameTarget?.file.id === file.id;

                    return (
                      <div
                        key={file.id}
                        className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-[#050A14] px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-300">
                            {isFolder ? (
                              <Folder className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <FileText className="h-4 w-4" aria-hidden="true" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            {isRenaming ? (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  if (renameTarget.draft.trim()) {
                                    setPendingMutation({
                                      kind: 'rename',
                                      file,
                                      nextName: renameTarget.draft.trim(),
                                    });
                                  }
                                }}
                                className="flex items-center gap-1.5"
                              >
                                <input
                                  type="text"
                                  autoFocus
                                  value={renameTarget.draft}
                                  onChange={(e) =>
                                    setRenameTarget({ file, draft: e.target.value })
                                  }
                                  className="min-h-[30px] flex-1 rounded-lg border border-sky-400 bg-slate-900 px-2 py-1 text-xs text-white focus:outline-none"
                                />
                                <button
                                  type="submit"
                                  className="rounded-lg bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRenameTarget(null)}
                                  className="rounded-lg px-2 py-1 text-[11px] text-slate-400 hover:text-white"
                                >
                                  Cancel
                                </button>
                              </form>
                            ) : (
                              <>
                                <p className="truncate text-xs font-medium text-white">{file.name}</p>
                                <p className="text-[11px] text-slate-400">
                                  {getFriendlyType(file.mimeType)} · {formatFileSize(file.size)}
                                  {file.modifiedTime
                                    ? ` · ${new Date(file.modifiedTime).toLocaleDateString()}`
                                    : ''}
                                </p>
                              </>
                            )}
                          </div>
                        </div>

                        {!isRenaming && (
                          <div className="flex shrink-0 items-center gap-1">
                            {canPreview && (
                              <button
                                type="button"
                                onClick={() => void handlePreview(file)}
                                aria-label={`Preview ${file.name}`}
                                title="Preview content"
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-sky-300"
                              >
                                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            )}
                            {file.webViewLink && (
                              <a
                                href={file.webViewLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Open ${file.name} in Google Drive`}
                                title="Open in Google Drive"
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
                              >
                                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => setRenameTarget({ file, draft: file.name })}
                              aria-label={`Rename ${file.name}`}
                              title="Rename file"
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingMutation({ kind: 'trash', file })}
                              aria-label={`Delete ${file.name}`}
                              title="Move to Trash"
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-950/70 hover:text-rose-300"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>

        {/* Explicit Confirmation Dialog for Mutating / Destructive Operations */}
        {pendingMutation && (
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Confirm Google Drive change"
            data-testid="drive-confirm-dialog"
            className="absolute inset-0 z-10 flex items-center justify-center bg-black/80 p-4"
          >
            <div className="w-full max-w-sm rounded-2xl border border-amber-500/35 bg-[#0B1426] p-5 shadow-2xl">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-semibold text-white">
                    {pendingMutation.kind === 'rename'
                      ? 'Confirm Rename in Google Drive?'
                      : pendingMutation.kind === 'delete'
                      ? 'Permanently Delete from Google Drive?'
                      : 'Move File to Google Drive Trash?'}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                    {pendingMutation.kind === 'rename'
                      ? `Rename "${pendingMutation.file.name}" to "${pendingMutation.nextName}"?`
                      : pendingMutation.kind === 'delete'
                      ? `Permanently delete "${pendingMutation.file.name}"? This cannot be undone.`
                      : `Move "${pendingMutation.file.name}" to Trash in your Google Drive?`}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={mutating}
                  onClick={() => setPendingMutation(null)}
                  className="min-h-[36px] rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                >
                  Cancel
                </button>
                {pendingMutation.kind === 'trash' && (
                  <button
                    type="button"
                    disabled={mutating}
                    onClick={() =>
                      setPendingMutation({ kind: 'delete', file: pendingMutation.file })
                    }
                    className="min-h-[36px] rounded-xl border border-rose-500/40 bg-rose-950/60 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-900/70"
                  >
                    Delete Forever
                  </button>
                )}
                <button
                  type="button"
                  data-testid="drive-confirm-action"
                  disabled={mutating}
                  onClick={() => void handleConfirmMutation()}
                  className={`min-h-[36px] rounded-xl px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60 ${
                    pendingMutation.kind === 'rename'
                      ? 'bg-sky-600 hover:bg-sky-500'
                      : 'bg-rose-600 hover:bg-rose-500'
                  }`}
                >
                  {mutating
                    ? 'Applying...'
                    : pendingMutation.kind === 'rename'
                    ? 'Confirm Rename'
                    : pendingMutation.kind === 'delete'
                    ? 'Confirm Permanent Delete'
                    : 'Move to Trash'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
