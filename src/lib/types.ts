export type Folder = {
  id: string;
  name: string;
};

export type Doc = {
  id: string;
  folderId: string | null;
  /** Page this one is nested under (subpage); null/absent = top level. */
  parentId?: string | null;
  title: string;
  /** Raw markdown source of the document. */
  content: string;
  pinned: boolean;
  updatedAt: number;
};

export type RailSection =
  | "home"
  | "docs"
  | "graph"
  | "tasks"
  | "agents"
  | "market"
  | "settings";
