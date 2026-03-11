export interface IParticipant {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface IEventResponse {
  id: string;
  title: string;
  description: string | null;
  date: Date;
  location: string;
  capacity: number | null;
  visibility: 'PUBLIC' | 'PRIVATE';
  authorId: string;
  _count?: {
    participants: number;
  };
  participants?: IParticipant[];
  isJoined?: boolean;
  isAuthor?: boolean;
}
