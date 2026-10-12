import { ipcMain } from 'electron';
import { IPC } from '@shared/ipcChannels';
import { writeContextFile } from './contextOps';
import { assertInsideActiveProject } from './pathContainment';
export const registerContextIpc = () => {
    ipcMain.handle(IPC.ContextWrite, async (_e, args) => {
        assertInsideActiveProject(args.projectPath);
        await writeContextFile(args);
    });
};
