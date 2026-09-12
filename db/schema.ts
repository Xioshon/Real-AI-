import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const rooms=sqliteTable('rooms',{code:text('code').primaryKey(),data:text('data').notNull(),version:integer('version').notNull().default(0),expires:integer('expires').notNull()},t=>[index('rooms_expires_idx').on(t.expires)]);
export const limits=sqliteTable('limits',{key:text('key').primaryKey(),count:integer('count').notNull(),expires:integer('expires').notNull()},t=>[index('limits_expires_idx').on(t.expires)]);
