CREATE TABLE "garments" (
	"id" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"style" text NOT NULL,
	"material" text NOT NULL,
	"formality" smallint NOT NULL,
	"image_url" text NOT NULL,
	"try_on_image_key" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "garments_category_chk" CHECK ("garments"."category" in ('suit','shirt','tie','shoes'))
);
--> statement-breakpoint
CREATE TABLE "generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"look_id" uuid,
	"provider" text NOT NULL,
	"provider_model" text,
	"provider_job_id" text,
	"status" text NOT NULL,
	"request_key" text NOT NULL,
	"look_key" text NOT NULL,
	"input_data" jsonb NOT NULL,
	"output_key" text,
	"error_code" text,
	"error_detail" text,
	"cache_hit" boolean DEFAULT false NOT NULL,
	"cached_from_id" uuid,
	"duration_ms" integer,
	"cost_credits" numeric(10, 2),
	"last_polled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "generations_status_chk" CHECK ("generations"."status" in ('queued','processing','completed','failed'))
);
--> statement-breakpoint
CREATE TABLE "looks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"suit_id" text,
	"shirt_id" text,
	"tie_id" text,
	"shoes_id" text,
	"generation_id" uuid,
	"generated_image_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"height_cm" smallint NOT NULL,
	"weight_kg" smallint NOT NULL,
	"build" text NOT NULL,
	"source_image_key" text,
	"model_image_key" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_build_chk" CHECK ("profiles"."build" in ('slim','average','athletic','broad'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "looks" ADD CONSTRAINT "looks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "looks" ADD CONSTRAINT "looks_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "looks" ADD CONSTRAINT "looks_suit_id_garments_id_fk" FOREIGN KEY ("suit_id") REFERENCES "public"."garments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "looks" ADD CONSTRAINT "looks_shirt_id_garments_id_fk" FOREIGN KEY ("shirt_id") REFERENCES "public"."garments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "looks" ADD CONSTRAINT "looks_tie_id_garments_id_fk" FOREIGN KEY ("tie_id") REFERENCES "public"."garments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "looks" ADD CONSTRAINT "looks_shoes_id_garments_id_fk" FOREIGN KEY ("shoes_id") REFERENCES "public"."garments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "looks" ADD CONSTRAINT "looks_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "garments_category_idx" ON "garments" USING btree ("category");--> statement-breakpoint
CREATE INDEX "generations_user_created_idx" ON "generations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "generations_cache_idx" ON "generations" USING btree ("user_id","request_key","status");--> statement-breakpoint
CREATE INDEX "generations_status_created_idx" ON "generations" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "generations_inflight_uniq" ON "generations" USING btree ("user_id","request_key") WHERE status in ('queued','processing');--> statement-breakpoint
CREATE INDEX "looks_user_created_idx" ON "looks" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "looks_user_generation_uniq" ON "looks" USING btree ("user_id","generation_id");--> statement-breakpoint
CREATE INDEX "profiles_user_created_idx" ON "profiles" USING btree ("user_id","created_at");