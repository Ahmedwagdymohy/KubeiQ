"use client";

import { createContext, useContext } from "react";

export type MapSelection = { selectedId: string | null; select: (id: string | null) => void };

export const MapContext = createContext<MapSelection>({ selectedId: null, select: () => {} });

export const useMapSelection = () => useContext(MapContext);
