import { useState } from 'react'
import { Check, Download, Play, Plus, Save, Trash2, Upload, X } from 'lucide-react'
import { BrandMark, PageFrame } from '../controls'
import type { SavedProfile, StudioConfig } from '../types'

export function ProfilesPage({ profiles, config, onSave, onLoad, onRename, onDelete, onExport, onImport }: {
  profiles: SavedProfile[]; config: StudioConfig; onSave(): void; onLoad(profile: SavedProfile): void
  onRename(id: string, name: string): boolean; onDelete(id: string): void; onExport(): void; onImport(): void
}) {
  // window.prompt() is not available in Electron, so renaming is edited in place.
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const submitRename = () => { if (renaming && onRename(renaming.id, renaming.name)) setRenaming(null) }
  return <PageFrame title="Profiles" subtitle="Save a complete control-room setup and recall it in one click." icon={<Save />}>
    <div className="profile-hero"><div><span className="kicker">CURRENT MIX</span><h2>{config.videoEnabled ? `${config.videoCodec.toUpperCase()} · ${config.maxFps} FPS · ${config.videoBitRate}` : `AUDIO ONLY · ${config.audioCodec.toUpperCase()}`}</h2><p>{Object.values(config.extras).filter(Boolean).length} advanced flags in this configuration.</p></div>
      <div className="profile-hero-actions"><button className="secondary" onClick={onImport}><Download size={15} />Import</button><button className="secondary" onClick={onExport} disabled={!profiles.length}><Upload size={15} />Export</button><button className="primary" onClick={onSave}><Save size={17} />Save as new profile</button></div></div>
    {profiles.length ? <div className="profile-grid">{profiles.map((profile, index) => <article className="profile-card" key={profile.id}>
      <div className={`profile-art art-${index % 4}`} data-tilt="1"><BrandMark /><span>{profile.config.maxFps}</span></div>
      <div className="profile-body"><span className="option-category">PROFILE {String(index + 1).padStart(2, '0')}</span>
        {renaming?.id === profile.id
          ? <form className="profile-rename-form" onSubmit={(event) => { event.preventDefault(); submitRename() }}>
            <input autoFocus aria-label="Profile name" value={renaming.name} onChange={(event) => setRenaming({ id: profile.id, name: event.target.value })} onFocus={(event) => event.target.select()} onKeyDown={(event) => { if (event.key === 'Escape') setRenaming(null) }} spellCheck={false} />
            <button type="submit" className="icon-button tiny" aria-label="Save name" title="Save name"><Check size={14} /></button>
            <button type="button" className="icon-button tiny" aria-label="Cancel rename" title="Cancel" onClick={() => setRenaming(null)}><X size={14} /></button>
          </form>
          : <h3>{profile.name}</h3>}
        <p>{profile.description}</p><small>Updated {new Date(profile.updatedAt).toLocaleDateString()}</small></div>
      <div className="profile-actions"><button onClick={() => onLoad(profile)}><Play size={14} />Load</button><button className="secondary profile-rename" onClick={() => setRenaming({ id: profile.id, name: profile.name })}>Rename</button><button className="icon-button tiny" aria-label={`Delete ${profile.name}`} title="Delete profile" onClick={() => { if (window.confirm(`Delete “${profile.name}”? This cannot be undone.`)) onDelete(profile.id) }}><Trash2 size={14} /></button></div>
    </article>)}</div> : <div className="empty-profiles"><BrandMark /><h2>Your presets will be saved here</h2><p>Tune the studio, then save the complete setup—including advanced flags and recording preferences.</p><button className="primary" onClick={onSave}><Plus size={17} />Save first profile</button></div>}
  </PageFrame>
}
