// Columns of every board in the task list on screen, by workgroup ID (TaskList provides it; the
// stage dropdown of each row reads it).
import { createContext } from 'react';
import type { BoardStage } from '../../api/types';

export const BoardsContext = createContext<Record<string, BoardStage[]>>({});
