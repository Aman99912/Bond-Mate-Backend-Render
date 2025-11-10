import { Types } from 'mongoose';

export interface MessageCursorPayload {
  createdAt: string;
  id: string;
}

const isValidISODate = (value: string): boolean => {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && value === date.toISOString();
};

export const encodeMessageCursor = (payload: MessageCursorPayload): string => {
  const encoded = JSON.stringify(payload);
  return Buffer.from(encoded, 'utf8').toString('base64');
};

export const decodeMessageCursor = (cursor: string): MessageCursorPayload => {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf8');
    const payload = JSON.parse(decoded) as MessageCursorPayload;

    if (!payload?.createdAt || !payload?.id) {
      throw new Error('Cursor payload missing required fields');
    }

    if (!isValidISODate(payload.createdAt)) {
      throw new Error('Cursor createdAt is not a valid ISO date');
    }

    if (!Types.ObjectId.isValid(payload.id)) {
      throw new Error('Cursor id is not a valid ObjectId');
    }

    return payload;
  } catch (error) {
    throw new Error('Invalid cursor');
  }
};

