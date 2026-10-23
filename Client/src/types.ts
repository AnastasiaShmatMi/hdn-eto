export type CalledWord = {
  id: string;
  text: string;
  at: number;
};

export type PlayerView = {
  id: string;
  name: string;
  displayName: string;
  cells: string[];
  marks: boolean[];
  winning: boolean[];
  lines: string[];
  bingo: boolean;
  closest: number;
  templateMarks?: boolean[];
  matchCount?: number;
  matchText?: string;
};

export type PublicState = {
  phase: 'lobby' | 'live';
  called: CalledWord[];
  cardCount: number;
  cardCountText: string;
  joinUrl: string;
  revision: number;
  round?: number;
  player: PlayerView | null;
};

export type CloudWord = {
  text: string;
  count: number;
  called: boolean;
};

export type HostState = {
  phase: 'lobby' | 'live';
  called: CalledWord[];
  cardCount: number;
  cardCountText: string;
  joinUrl: string;
  revision: number;
  round?: number;
  players: PlayerView[];
  cloud: CloudWord[];
  template?: string[];
};
