import { dialog, ipcMain, shell } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { IPC } from '@shared/ipcChannels';
import type {
  ExportHtmlArgs,
  ExportHtmlChooseFolderResult,
  ExportHtmlResult,
} from '@shared/types';
import { assetsDirFor } from './imageOps';
import { assertInsideActiveProject } from './pathContainment';
import { getProjectFormat } from './projectFormatCache';
import {
  candidateFolderName,
  classifyTarget,
  copyAssets,
  exportFolderName,
  MAX_FOLDER_ATTEMPTS,
  writeExportFiles,
  writeMarker,
} from './htmlExportOps';

/**
 * Folders the user approved this session through the native dialog.
 *
 * The export writes to an arbitrary location, so project containment doesn't
 * apply — the dialog is the trust boundary instead, exactly as it is for
 * PNG/SVG export in `export.ts`. The renderer only ever names the approved
 * PARENT; main derives the folder actually written to, so a compromised
 * renderer can't redirect the write somewhere else.
 */
const dialogApprovedDirs = new Set<string>();

/**
 * Last export destination, so a second export doesn't send the user back
 * to ~/Downloads. see docs/plans/electron-upgrade-plan.md
 */
let lastExportDir: string | null = null;

const chooseFolder = async (): Promise<ExportHtmlChooseFolderResult> => {
  const result = await dialog.showOpenDialog({
    title: 'Choose where to put the exported site',
    buttonLabel: 'Export here',
    ...(lastExportDir !== null ? { defaultPath: lastExportDir } : {}),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, path: null };
  }
  const chosen = result.filePaths[0] ?? '';
  lastExportDir = path.dirname(chosen);
  dialogApprovedDirs.add(path.resolve(chosen));
  return { canceled: false, path: chosen };
};

type DirState = 'missing' | 'empty' | 'previous-export' | 'occupied';

const inspectDir = async (dir: string): Promise<DirState> => {
  try {
    return classifyTarget(await fs.readdir(dir));
  } catch (err) {
    // ENOENT is the good case — nothing there to protect.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
    throw err;
  }
};

/**
 * Pick the folder to write into, inside the parent the user chose.
 *
 * Re-exporting reuses the folder from last time; a name held by something
 * Scamp didn't write is stepped over rather than overwritten.
 */
const resolveTargetDir = async (
  parentDir: string,
  projectName: string
): Promise<string> => {
  const base = exportFolderName(projectName);
  for (let attempt = 1; attempt <= MAX_FOLDER_ATTEMPTS; attempt += 1) {
    const candidate = path.join(parentDir, candidateFolderName(base, attempt));
    const state = await inspectDir(candidate);
    if (state !== 'occupied') return candidate;
  }
  throw new Error(
    `Couldn't find a free folder name in ${parentDir}. Try a different location.`
  );
};

const exportHtml = async (args: ExportHtmlArgs): Promise<ExportHtmlResult> => {
  try {
    assertInsideActiveProject(args.projectPath);
    const parentDir = path.resolve(args.parentDir);
    if (!dialogApprovedDirs.has(parentDir)) {
      throw new Error('Choose an export folder first.');
    }

    const targetDir = await resolveTargetDir(parentDir, args.projectName);
    await fs.mkdir(targetDir, { recursive: true });

    await writeExportFiles(targetDir, args.files);

    const format = await getProjectFormat(args.projectPath);
    const assetCount = await copyAssets(
      assetsDirFor(args.projectPath, format),
      path.join(targetDir, 'assets')
    );

    await writeMarker(targetDir, args.projectName, new Date().toISOString());

    // Convenience, not confirmation — this silently does nothing on some
    // Linux desktops, which is why the button reports the result too.
    void shell.openPath(targetDir);

    return {
      ok: true,
      targetDir,
      fileCount: args.files.length,
      assetCount,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to export.',
    };
  }
};

export const registerHtmlExportIpc = (): void => {
  ipcMain.handle(IPC.ExportHtmlChooseFolder, async () => chooseFolder());
  ipcMain.handle(IPC.ExportHtmlWrite, async (_e, args: ExportHtmlArgs) =>
    exportHtml(args)
  );
};
