import { ipcMain } from 'electron';

import { IPC } from '@shared/ipcChannels';
import type { ContextWriteArgs } from '@shared/types';

import { writeContextFile } from './contextOps';
import { assertInsideActiveProject } from './pathContainment';

export const registerContextIpc = (): void => {
  ipcMain.handle(IPC.ContextWrite, async (_e, args: ContextWriteArgs) => {
    assertInsideActiveProject(args.projectPath);
    await writeContextFile(args);
  });
};
