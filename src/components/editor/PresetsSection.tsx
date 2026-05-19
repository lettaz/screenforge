import { useCallback, useEffect, useState } from "react";
import {
  Download,
  Plus,
  Trash2,
  Upload,
  CheckCircle2,
} from "lucide-react";
import { useProjectStore } from "../../stores/projectStore";
import {
  createPresetFromConfig,
  deleteUserPreset,
  exportPresetToFile,
  importPresetFromFile,
  listPresets,
  saveUserPreset,
  type Preset,
} from "../../utils/presets";

export default function PresetsSection() {
  const { project, updateConfig } = useProjectStore();
  const [builtin, setBuiltin] = useState<Preset[]>([]);
  const [user, setUser] = useState<Preset[]>([]);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [appliedId, setAppliedId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const { builtin: b, user: u } = listPresets();
    setBuiltin(b);
    setUser(u);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!project) {
    return null;
  }

  const applyPreset = (preset: Preset) => {
    updateConfig(preset.payload);
    setAppliedId(preset.id);
    window.setTimeout(() => setAppliedId(null), 1200);
  };

  const handleSaveCurrent = () => {
    const trimmed = newName.trim();
    if (trimmed.length === 0) {
      setError("Name is required");
      return;
    }
    if (trimmed.length > 60) {
      setError("Name must be 60 characters or fewer");
      return;
    }
    const preset = createPresetFromConfig(trimmed, project.config);
    saveUserPreset(preset);
    setNewName("");
    setError(null);
    refresh();
  };

  const handleDelete = (id: string) => {
    deleteUserPreset(id);
    refresh();
  };

  const handleExport = async (preset: Preset) => {
    try {
      await exportPresetToFile(preset);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to export preset");
    }
  };

  const handleImport = async () => {
    try {
      const imported = await importPresetFromFile();
      if (imported) {
        refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to import preset");
    }
  };

  return (
    <div className="space-y-4 text-xs">
      <div className="space-y-2">
        <label htmlFor="preset-name" className="block text-white/70">
          Save current style as preset
        </label>
        <div className="flex gap-1.5">
          <input
            id="preset-name"
            type="text"
            placeholder="Preset name"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              if (error) setError(null);
            }}
            maxLength={60}
            className="flex-1 bg-background border border-border rounded-md px-2 py-1.5 text-white placeholder:text-white/30"
          />
          <button
            type="button"
            onClick={handleSaveCurrent}
            className="px-2.5 rounded-md border border-border hover:border-accent text-white/80"
            title="Save preset"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {error && <p className="text-destructive text-[11px]">{error}</p>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-white/50 uppercase tracking-wide text-[10px]">
            Built-in
          </span>
          <button
            type="button"
            onClick={handleImport}
            className="flex items-center gap-1 text-white/60 hover:text-white"
            title="Import preset from file"
          >
            <Upload className="w-3 h-3" />
            Import
          </button>
        </div>
        <ul className="space-y-1">
          {builtin.map((preset) => (
            <PresetRow
              key={preset.id}
              preset={preset}
              applied={appliedId === preset.id}
              onApply={() => applyPreset(preset)}
              onExport={() => handleExport(preset)}
            />
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <span className="text-white/50 uppercase tracking-wide text-[10px]">
          Your presets ({user.length})
        </span>
        {user.length === 0 ? (
          <p className="text-white/40 text-[11px]">
            Save the current style above to start your library.
          </p>
        ) : (
          <ul className="space-y-1">
            {user.map((preset) => (
              <PresetRow
                key={preset.id}
                preset={preset}
                applied={appliedId === preset.id}
                onApply={() => applyPreset(preset)}
                onExport={() => handleExport(preset)}
                onDelete={() => handleDelete(preset.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface PresetRowProps {
  preset: Preset;
  applied: boolean;
  onApply: () => void;
  onExport: () => void;
  onDelete?: () => void;
}

function PresetRow({
  preset,
  applied,
  onApply,
  onExport,
  onDelete,
}: PresetRowProps) {
  return (
    <li className="group flex items-center gap-1 px-2 py-1.5 rounded-md border border-border hover:border-accent/60 bg-background">
      <button
        type="button"
        onClick={onApply}
        className="flex-1 text-left truncate text-white/85 hover:text-white"
        title={preset.name}
      >
        {preset.name}
      </button>
      {applied && <CheckCircle2 className="w-3.5 h-3.5 text-success" />}
      <button
        type="button"
        onClick={onExport}
        className="opacity-0 group-hover:opacity-100 text-white/50 hover:text-white p-0.5"
        title="Export to file"
      >
        <Download className="w-3 h-3" />
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 text-white/50 hover:text-destructive p-0.5"
          title="Delete preset"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </li>
  );
}
