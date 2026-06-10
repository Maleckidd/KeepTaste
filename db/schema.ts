import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const cookbooks = sqliteTable('cookbooks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  coverImagePath: text('cover_image_path'),
  createdAt: text('created_at').notNull().default(new Date().toISOString()),
});

export const recipes = sqliteTable('recipes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cookbookId: integer('cookbook_id').references(() => cookbooks.id, {
    onDelete: 'set null',
  }),
  title: text('title').notNull(),
  prepTime: integer('prep_time'), // in minutes
  cookTime: integer('cook_time'), // in minutes
  servings: integer('servings'),
  imagePath: text('image_path'),
  ingredients: text('ingredients').notNull().default(''),
  instructions: text('instructions').notNull().default(''),
  notes: text('notes').default(''),
  createdAt: text('created_at').notNull().default(new Date().toISOString()),
  updatedAt: text('updated_at').notNull().default(new Date().toISOString()),
});

// TypeScript types derived from the schema
export type Cookbook = typeof cookbooks.$inferSelect;
export type NewCookbook = typeof cookbooks.$inferInsert;
export type Recipe = typeof recipes.$inferSelect;
export type NewRecipe = typeof recipes.$inferInsert;
