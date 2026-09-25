export type Folder = {
  id: string;
  name: string;
};

export type Doc = {
  id: string;
  folderId: string | null;
  title: string;
  /** Raw markdown source of the document. */
  content: string;
  pinned: boolean;
  updatedAt: number;
};

export type RailSection =
  | "home"
  | "docs"
  | "tasks"
  | "agents"
  | "market"
  | "settings";
