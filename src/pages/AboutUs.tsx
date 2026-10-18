import React, {useEffect, useRef, useState} from 'react';
import {api} from '../services/api';
import {useAuth} from '../context/AuthContext';
import {EduGuardLogo} from '../components/EduGuardLogo';
import {TeamMember} from '../types';
import {
  ShieldCheck,
  Linkedin,
  Edit2,
  Check,
  Cpu,
  Lock,
  GraduationCap,
  Sparkles,
  ExternalLink,
  Camera,
  X,
  Download,
} from 'lucide-react';

const INITIAL_TEAM: TeamMember[] = [
  {
    id: 'member-1',
    name: 'Team Member 1',
    role: 'Security Architect & Lead',
    linkedin: '',
    isPlaceholder: true,
  },
  {
    id: 'member-2',
    name: 'Team Member 2',
    role: 'AI / LLM Agent Engineer',
    linkedin: '',
    isPlaceholder: true,
  },
  {
    id: 'member-3',
    name: 'Team Member 3',
    role: 'Full-Stack Systems Engineer',
    linkedin: '',
    isPlaceholder: true,
  },
  {
    id: 'member-4',
    name: 'Team Member 4',
    role: 'Data Privacy & FERPA Compliance',
    linkedin: '',
    isPlaceholder: true,
  },
  {
    id: 'member-5',
    name: 'Team Member 5',
    role: 'Frontend Experience & Security UI',
    linkedin: '',
    isPlaceholder: true,
  },
];

const OLD_PLACEHOLDER_URL = /linkedin\.com\/in\/sentrx-member-\d/i;

/** Turns what the user typed into a safe absolute https URL, or '' if it is not usable. */
function normalizeLinkedIn(input: string): string {
  const raw = input.trim();
  if (!raw) return '';
  let url = raw;
  if (!/^https?:\/\//i.test(url)) url = `https://${url.replace(/^\/+/, '')}`;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

/** Reads an image file and returns a small square JPEG data URL (keeps localStorage small). */
function fileToAvatar(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not a valid image.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Image processing is not supported in this browser.'));
        const side = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export const AboutUs: React.FC = () => {
  const {currentUser} = useAuth();
  const isSuperAdmin = currentUser?.id === 'ADM-001';
  const [exportError, setExportError] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamMember[]>(() => {
    try {
      const saved = localStorage.getItem('eduguard_team_members');
      if (!saved) return INITIAL_TEAM;
      const parsed: TeamMember[] = JSON.parse(saved);
      return parsed.map((m) => (OLD_PLACEHOLDER_URL.test(m.linkedin || '') ? {...m, linkedin: ''} : m));
    } catch {
      return INITIAL_TEAM;
    }
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{name: string; role: string; linkedin: string; photo: string}>({
    name: '',
    role: '',
    linkedin: '',
    photo: '',
  });
  const [formError, setFormError] = useState<string | null>(null);

  // Team profiles are shared through the server so every administrator sees the same page.
  useEffect(() => {
    let cancelled = false;
    api
      .getTeam()
      .then((members) => {
        if (!cancelled && members && members.length) {
          setTeam(members.map((m) => (OLD_PLACEHOLDER_URL.test(m.linkedin || '') ? {...m, linkedin: ''} : m)));
        }
      })
      .catch(() => {
        /* keep the locally cached version */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleStartEdit = (member: TeamMember) => {
    setEditingId(member.id);
    setEditForm({
      name: member.name,
      role: member.role,
      linkedin: member.linkedin,
      photo: member.photo || '',
    });
    setFormError(null);
  };

  const handlePhotoChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFormError('Please choose an image file (JPG, PNG, WebP).');
      return;
    }
    try {
      const photo = await fileToAvatar(file);
      setEditForm((f) => ({...f, photo}));
      setFormError(null);
    } catch (err: any) {
      setFormError(err.message || 'Could not use that image.');
    }
  };

  const handleSaveEdit = (id: string) => {
    const typedLinkedIn = editForm.linkedin.trim();
    const linkedin = normalizeLinkedIn(typedLinkedIn);
    if (typedLinkedIn && !linkedin) {
      setFormError('Please enter a valid LinkedIn URL, e.g. https://www.linkedin.com/in/your-name');
      return;
    }
    setFormError(null);
    const updated = team.map((m) =>
      m.id === id
        ? {
            ...m,
            name: editForm.name.trim() || m.name,
            role: editForm.role.trim() || m.role,
            linkedin,
            photo: editForm.photo || undefined,
            isPlaceholder: false,
          }
        : m
    );
    setTeam(updated);
    setEditingId(null);
    try {
      localStorage.setItem('eduguard_team_members', JSON.stringify(updated));
    } catch {
      /* local cache is optional */
    }
    api.saveTeam(updated).catch((err: any) => {
      setFormError(err?.message || 'Saved in this browser only; could not save to the server.');
    });
  };

  return (
    <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
      {/* Project Introduction Hero */}
      <section className="text-center max-w-3xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-950/40 text-cyan-300 text-xs font-mono">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Developed by Team SentrX</span>
        </div>

        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight">
          EduGuard Agent — AI Security for Educational Data Protection
        </h1>

        <p className="text-base sm:text-lg text-slate-300 leading-relaxed">
          EduGuard Agent helps school administrators identify risky access to student data, understand security findings, and make informed decisions about protecting sensitive educational information.
        </p>
      </section>

      {/* Core Architectural Pillars */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-2xl border border-slate-800/90 bg-[#0A1022]/75 backdrop-blur-md space-y-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/70 border border-cyan-800/40 flex items-center justify-center text-cyan-400">
            <Lock className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white">Student Data Privacy</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Continuous boundary enforcement across student demographic, academic, and class records. Prevents unauthorized out-of-district vendor access and dormant employee record queries in compliance with FERPA.
          </p>
        </div>

        <div className="p-6 rounded-2xl border border-slate-800/90 bg-[#0A1022]/75 backdrop-blur-md space-y-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-950/70 border border-indigo-800/40 flex items-center justify-center text-indigo-400">
            <Cpu className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white">AI Security Intelligence</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Synthesizes raw identity facts, permissions levels, and time-series access logs to generate natural-language explanations, policy-floor risk evaluations, and actionable mitigation guidance.
          </p>
        </div>

        <div className="p-6 rounded-2xl border border-slate-800/90 bg-[#0A1022]/75 backdrop-blur-md space-y-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-950/70 border border-emerald-800/40 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white">Human-In-The-Loop Safety</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Strict administrator governance where the AI recommends and explains, but only authorized human security officers can approve, reject, or escalate findings. No automatic destructive execution.
          </p>
        </div>
      </section>

      {/* Team SentrX: Exactly 5 Team Member Cards */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Team SentrX
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Five team member profiles. Click the edit button on any card to customize names, roles, photos, and LinkedIn links.
            </p>
          </div>
          <div className="text-xs font-mono text-cyan-400 bg-slate-900 border border-slate-800 px-3 py-1 rounded-lg">
            5 Core Contributors
          </div>
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChosen} />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {team.map((member, index) => {
            const isEditing = editingId === member.id;

            return (
              <div
                key={member.id}
                className="rounded-2xl border border-slate-800/90 bg-[#0A1022]/70 backdrop-blur-md p-5 flex flex-col justify-between hover:border-slate-700 transition-all group relative"
              >
                {/* Top Badge: Role Index */}
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                    SentrX 0{index + 1}
                  </span>

                  <button
                    onClick={() => (isEditing ? handleSaveEdit(member.id) : handleStartEdit(member))}
                    title={isEditing ? 'Save profile' : 'Edit placeholder'}
                    className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors"
                  >
                    {isEditing ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Edit2 className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Avatar / Member Photo */}
                <div className="relative w-16 h-16 mb-4">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gradient-to-tr from-cyan-900/60 via-indigo-900/40 to-slate-800 border border-slate-700 flex items-center justify-center text-cyan-300 group-hover:scale-105 transition-transform shadow-inner">
                    {(isEditing ? editForm.photo : member.photo) ? (
                      <img
                        src={isEditing ? editForm.photo : member.photo}
                        alt={member.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <GraduationCap className="w-7 h-7" />
                    )}
                  </div>
                  {isEditing && (
                    <>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        title="Upload photo"
                        className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white border border-slate-900"
                      >
                        <Camera className="w-3 h-3" />
                      </button>
                      {editForm.photo && (
                        <button
                          type="button"
                          onClick={() => setEditForm({...editForm, photo: ''})}
                          title="Remove photo"
                          className="absolute -top-1 -right-1 p-1 rounded-full bg-slate-800 hover:bg-rose-600 text-slate-200 border border-slate-700"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Profile Fields or In-Place Edit Form */}
                <div className="flex-1 space-y-1">
                  {isEditing ? (
                    <div className="space-y-2">
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase font-mono">Full Name</label>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                          className="w-full p-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase font-mono">Role</label>
                        <input
                          type="text"
                          value={editForm.role}
                          onChange={(e) => setEditForm({...editForm, role: e.target.value})}
                          className="w-full p-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase font-mono">LinkedIn URL</label>
                        <input
                          type="text"
                          placeholder="https://www.linkedin.com/in/your-name"
                          value={editForm.linkedin}
                          onChange={(e) => setEditForm({...editForm, linkedin: e.target.value})}
                          className="w-full p-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white"
                        />
                      </div>
                      {formError && <p className="text-[10px] text-rose-400">{formError}</p>}
                      <button
                        onClick={() => handleSaveEdit(member.id)}
                        className="w-full py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-semibold mt-1"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <>
                      <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">
                        {member.name}
                      </h3>
                      <p className="text-xs text-slate-400 line-clamp-2">
                        {member.role}
                      </p>
                      {member.isPlaceholder && (
                        <span className="inline-block text-[10px] text-cyan-400/80 font-mono mt-1">
                          (Editable Placeholder)
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* LinkedIn Profile Link */}
                {!isEditing && (
                  <div className="mt-4 pt-3 border-t border-slate-800/80">
                    {member.linkedin ? (
                      <a
                        href={member.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-medium group/link"
                      >
                        <Linkedin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="truncate">LinkedIn Profile</span>
                        <ExternalLink className="w-3 h-3 opacity-70 group-hover/link:opacity-100" />
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStartEdit(member)}
                        className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-300"
                      >
                        <Linkedin className="w-3.5 h-3.5 shrink-0" />
                        <span>Add LinkedIn</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {!editingId && formError && <p className="text-center text-xs text-rose-400">{formError}</p>}

      {isSuperAdmin && (
        <section className="max-w-3xl mx-auto text-center space-y-2">
          <button
            type="button"
            onClick={() => {
              setExportError(null);
              api.downloadSignupsCsv().catch((err: any) => setExportError(err?.message || 'Export failed.'));
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700 bg-slate-900/70 text-xs text-slate-300 hover:text-cyan-300 hover:border-cyan-700"
          >
            <Download className="w-3.5 h-3.5" />
            Export administrator signups (CSV)
          </button>
          {exportError && <p className="text-xs text-rose-400">{exportError}</p>}
        </section>
      )}
    </div>
  );
};
