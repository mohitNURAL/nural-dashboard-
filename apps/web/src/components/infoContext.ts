// The line every "i" tooltip adds under its explanation: what the current filters cover
// ("Showing: Dev tasks · Moto India · Umang Singh"). Each tab provides it.
import { createContext, useContext } from 'react';

export const InfoContext = createContext<string | null>(null);
export const useInfoContext = () => useContext(InfoContext);
