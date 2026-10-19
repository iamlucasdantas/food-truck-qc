export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          key_prefix: string
          label: string
          last_used_at: string | null
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          key_prefix: string
          label?: string
          last_used_at?: string | null
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          label?: string
          last_used_at?: string | null
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          created_at: string
          description: string
          facebook: string | null
          instagram: string | null
          logo_url: string | null
          name: string
          owner_id: string
          payment_methods: string[]
          payment_other: string
          reddit: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          description?: string
          facebook?: string | null
          instagram?: string | null
          logo_url?: string | null
          name?: string
          owner_id: string
          payment_methods?: string[]
          payment_other?: string
          reddit?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          facebook?: string | null
          instagram?: string | null
          logo_url?: string | null
          name?: string
          owner_id?: string
          payment_methods?: string[]
          payment_other?: string
          reddit?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      calendar_feeds: {
        Row: {
          created_at: string
          created_by: string
          id: string
          kind: string
          truck_id: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          truck_id: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          truck_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_feeds_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_api_logs: {
        Row: {
          auth_detail: string | null
          auth_ok: boolean
          created_at: string
          endpoint: string
          error: string | null
          id: string
          method: string
          params: Json
          status: number
          user_agent: string | null
        }
        Insert: {
          auth_detail?: string | null
          auth_ok: boolean
          created_at?: string
          endpoint: string
          error?: string | null
          id?: string
          method: string
          params?: Json
          status: number
          user_agent?: string | null
        }
        Update: {
          auth_detail?: string | null
          auth_ok?: boolean
          created_at?: string
          endpoint?: string
          error?: string | null
          id?: string
          method?: string
          params?: Json
          status?: number
          user_agent?: string | null
        }
        Relationships: []
      }
      claims: {
        Row: {
          created_at: string
          id: string
          message: string
          reject_reason: string | null
          reviewed_at: string | null
          status: Database["public"]["Enums"]["claim_status"]
          truck_id: string
          user_email: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string
          reject_reason?: string | null
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["claim_status"]
          truck_id: string
          user_email?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          reject_reason?: string | null
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["claim_status"]
          truck_id?: string
          user_email?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claims_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          truck_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          truck_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          truck_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      geocode_cache: {
        Row: {
          city: string | null
          created_at: string
          lat: number | null
          lng: number | null
          query: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          lat?: number | null
          lng?: number | null
          query: string
        }
        Update: {
          city?: string | null
          created_at?: string
          lat?: number | null
          lng?: number | null
          query?: string
        }
        Relationships: []
      }
      ingestion_runs: {
        Row: {
          cities_done: string[]
          cities_total: string[]
          error: string | null
          finished_at: string | null
          id: string
          items_created: number
          items_found: number
          meta: Json
          notes: string | null
          source: string
          started_at: string
          status: string
        }
        Insert: {
          cities_done?: string[]
          cities_total?: string[]
          error?: string | null
          finished_at?: string | null
          id?: string
          items_created?: number
          items_found?: number
          meta?: Json
          notes?: string | null
          source: string
          started_at?: string
          status?: string
        }
        Update: {
          cities_done?: string[]
          cities_total?: string[]
          error?: string | null
          finished_at?: string | null
          id?: string
          items_created?: number
          items_found?: number
          meta?: Json
          notes?: string | null
          source?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      profile_settings: {
        Row: {
          bio: string
          cuisines: string[]
          dietary: string[]
          home_area: string
          notifications: Json
          share_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string
          cuisines?: string[]
          dietary?: string[]
          home_area?: string
          notifications?: Json
          share_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string
          cuisines?: string[]
          dietary?: string[]
          home_area?: string
          notifications?: Json
          share_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_trucks: {
        Row: {
          bell: boolean
          following: boolean
          list: string
          truck_id: string
          user_id: string
          viewed_at: string | null
          visited_at: string | null
        }
        Insert: {
          bell?: boolean
          following?: boolean
          list?: string
          truck_id: string
          user_id: string
          viewed_at?: string | null
          visited_at?: string | null
        }
        Update: {
          bell?: boolean
          following?: boolean
          list?: string
          truck_id?: string
          user_id?: string
          viewed_at?: string | null
          visited_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_trucks_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          crm_synced_at: string | null
          display_name: string
          id: string
          notify_favorites: boolean
          onboarding: Json
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          crm_synced_at?: string | null
          display_name?: string
          id: string
          notify_favorites?: boolean
          onboarding?: Json
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          crm_synced_at?: string | null
          display_name?: string
          id?: string
          notify_favorites?: boolean
          onboarding?: Json
        }
        Relationships: []
      }
      social_posts: {
        Row: {
          processed_at: string
          run_id: string | null
          source_id: string | null
          stops_created: number
          url: string
        }
        Insert: {
          processed_at?: string
          run_id?: string | null
          source_id?: string | null
          stops_created?: number
          url: string
        }
        Update: {
          processed_at?: string
          run_id?: string | null
          source_id?: string | null
          stops_created?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "social_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      social_sources: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: string
          last_posts: number
          last_reason: string | null
          last_run_at: string | null
          last_status: string | null
          last_stops: number
          name: string
          truck_id: string | null
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind: string
          last_posts?: number
          last_reason?: string | null
          last_run_at?: string | null
          last_status?: string | null
          last_stops?: number
          name?: string
          truck_id?: string | null
          url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          last_posts?: number
          last_reason?: string | null
          last_run_at?: string | null
          last_status?: string | null
          last_stops?: number
          name?: string
          truck_id?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_sources_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      stop_series: {
        Row: {
          address: string | null
          city: string
          created_at: string
          end_date: string | null
          end_time: string
          external_uid: string | null
          freq: string
          id: string
          lat: number
          lng: number
          month_nth: number | null
          note: string | null
          skip_dates: string[]
          start_date: string
          start_time: string
          truck_id: string
          venue_name: string
          weekdays: number[]
        }
        Insert: {
          address?: string | null
          city?: string
          created_at?: string
          end_date?: string | null
          end_time: string
          external_uid?: string | null
          freq: string
          id?: string
          lat: number
          lng: number
          month_nth?: number | null
          note?: string | null
          skip_dates?: string[]
          start_date: string
          start_time: string
          truck_id: string
          venue_name?: string
          weekdays?: number[]
        }
        Update: {
          address?: string | null
          city?: string
          created_at?: string
          end_date?: string | null
          end_time?: string
          external_uid?: string | null
          freq?: string
          id?: string
          lat?: number
          lng?: number
          month_nth?: number | null
          note?: string | null
          skip_dates?: string[]
          start_date?: string
          start_time?: string
          truck_id?: string
          venue_name?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "stop_series_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      stops: {
        Row: {
          address: string | null
          cancelled: boolean
          city: string
          confidence: number
          created_at: string
          ends_at: string
          id: string
          is_live: boolean
          lat: number
          lng: number
          note: string | null
          occurrence_date: string | null
          repeat_group: string | null
          series_id: string | null
          source: Database["public"]["Enums"]["stop_source"]
          source_url: string | null
          starts_at: string
          truck_id: string
          venue_name: string
        }
        Insert: {
          address?: string | null
          cancelled?: boolean
          city?: string
          confidence?: number
          created_at?: string
          ends_at: string
          id?: string
          is_live?: boolean
          lat: number
          lng: number
          note?: string | null
          occurrence_date?: string | null
          repeat_group?: string | null
          series_id?: string | null
          source?: Database["public"]["Enums"]["stop_source"]
          source_url?: string | null
          starts_at: string
          truck_id: string
          venue_name?: string
        }
        Update: {
          address?: string | null
          cancelled?: boolean
          city?: string
          confidence?: number
          created_at?: string
          ends_at?: string
          id?: string
          is_live?: boolean
          lat?: number
          lng?: number
          note?: string | null
          occurrence_date?: string | null
          repeat_group?: string | null
          series_id?: string | null
          source?: Database["public"]["Enums"]["stop_source"]
          source_url?: string | null
          starts_at?: string
          truck_id?: string
          venue_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "stops_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "stop_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stops_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      suggested_stops: {
        Row: {
          address: string | null
          author: string | null
          city: string
          created_at: string
          ends_at: string
          excerpt: string
          id: string
          lat: number | null
          lng: number | null
          needs_address_check: boolean
          reviewed_at: string | null
          source: string
          source_url: string | null
          starts_at: string
          status: string
          truck_id: string
          venue_name: string
        }
        Insert: {
          address?: string | null
          author?: string | null
          city?: string
          created_at?: string
          ends_at: string
          excerpt?: string
          id?: string
          lat?: number | null
          lng?: number | null
          needs_address_check?: boolean
          reviewed_at?: string | null
          source?: string
          source_url?: string | null
          starts_at: string
          status?: string
          truck_id: string
          venue_name?: string
        }
        Update: {
          address?: string | null
          author?: string | null
          city?: string
          created_at?: string
          ends_at?: string
          excerpt?: string
          id?: string
          lat?: number | null
          lng?: number | null
          needs_address_check?: boolean
          reviewed_at?: string | null
          source?: string
          source_url?: string | null
          starts_at?: string
          status?: string
          truck_id?: string
          venue_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "suggested_stops_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      truck_deletions: {
        Row: {
          action: string
          actor: string | null
          actor_email: string | null
          created_at: string
          id: string
          truck_id: string
          truck_name: string
        }
        Insert: {
          action: string
          actor?: string | null
          actor_email?: string | null
          created_at?: string
          id?: string
          truck_id: string
          truck_name: string
        }
        Update: {
          action?: string
          actor?: string | null
          actor_email?: string | null
          created_at?: string
          id?: string
          truck_id?: string
          truck_name?: string
        }
        Relationships: []
      }
      truck_photos: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_cover: boolean
          path: string
          position: number
          truck_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          is_cover?: boolean
          path: string
          position?: number
          truck_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_cover?: boolean
          path?: string
          position?: number
          truck_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "truck_photos_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      trucks: {
        Row: {
          accepts_card: boolean
          base_address: string | null
          base_lat: number | null
          base_lng: number | null
          base_location_confirmed_at: string | null
          business_name: string
          category: string
          claimed_by: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string
          emoji: string
          facebook: string | null
          google_business_status: string | null
          google_hours_updated_at: string | null
          google_location_verified: boolean
          google_place_id: string | null
          google_regular_hours: Json | null
          google_types: string[]
          id: string
          instagram: string | null
          is_food_truck: boolean
          logo_url: string | null
          menu: Json
          menu_search: string
          menu_sections: Json | null
          menu_updated_at: string | null
          merged_into: string | null
          name: string
          payment_methods: string[]
          payment_other: string
          payments_same_as_business: boolean
          phone: string | null
          reddit: string | null
          source: string
          status: Database["public"]["Enums"]["truck_status"]
          truck_type: string
          updated_at: string
          website: string | null
        }
        Insert: {
          accepts_card?: boolean
          base_address?: string | null
          base_lat?: number | null
          base_lng?: number | null
          base_location_confirmed_at?: string | null
          business_name?: string
          category?: string
          claimed_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string
          emoji?: string
          facebook?: string | null
          google_business_status?: string | null
          google_hours_updated_at?: string | null
          google_location_verified?: boolean
          google_place_id?: string | null
          google_regular_hours?: Json | null
          google_types?: string[]
          id: string
          instagram?: string | null
          is_food_truck?: boolean
          logo_url?: string | null
          menu?: Json
          menu_search?: string
          menu_sections?: Json | null
          menu_updated_at?: string | null
          merged_into?: string | null
          name: string
          payment_methods?: string[]
          payment_other?: string
          payments_same_as_business?: boolean
          phone?: string | null
          reddit?: string | null
          source?: string
          status?: Database["public"]["Enums"]["truck_status"]
          truck_type?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          accepts_card?: boolean
          base_address?: string | null
          base_lat?: number | null
          base_lng?: number | null
          base_location_confirmed_at?: string | null
          business_name?: string
          category?: string
          claimed_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string
          emoji?: string
          facebook?: string | null
          google_business_status?: string | null
          google_hours_updated_at?: string | null
          google_location_verified?: boolean
          google_place_id?: string | null
          google_regular_hours?: Json | null
          google_types?: string[]
          id?: string
          instagram?: string | null
          is_food_truck?: boolean
          logo_url?: string | null
          menu?: Json
          menu_search?: string
          menu_sections?: Json | null
          menu_updated_at?: string | null
          merged_into?: string | null
          name?: string
          payment_methods?: string[]
          payment_other?: string
          payments_same_as_business?: boolean
          phone?: string | null
          reddit?: string | null
          source?: string
          status?: Database["public"]["Enums"]["truck_status"]
          truck_type?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      venues: {
        Row: {
          address: string | null
          city: string
          confirmed: boolean
          created_at: string
          id: string
          lat: number
          lng: number
          name: string
          norm_name: string
          source: string
        }
        Insert: {
          address?: string | null
          city?: string
          confirmed?: boolean
          created_at?: string
          id?: string
          lat: number
          lng: number
          name: string
          norm_name: string
          source?: string
        }
        Update: {
          address?: string | null
          city?: string
          confirmed?: boolean
          created_at?: string
          id?: string
          lat?: number
          lng?: number
          name?: string
          norm_name?: string
          source?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_trucks: { Args: { _ids: string[] }; Returns: number }
      admin_restore_truck: { Args: { _id: string }; Returns: undefined }
      admin_review_suggested_stop: {
        Args: { _approve: boolean; _id: string }
        Returns: undefined
      }
      confirm_truck_location: {
        Args: { _google_verified?: boolean; _truck_id: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      merge_trucks: {
        Args: { _dup: string; _keep: string }
        Returns: undefined
      }
      owner_favorite_summary: { Args: { _truck_id: string }; Returns: Json }
      owner_id_by_email: { Args: { _email: string }; Returns: string }
      owns_truck: { Args: { _truck_id: string }; Returns: boolean }
      purge_deleted_trucks: { Args: never; Returns: number }
      review_claim:
        | { Args: { _approve: boolean; _claim_id: string }; Returns: undefined }
        | {
            Args: { _approve: boolean; _claim_id: string; _reason: string }
            Returns: undefined
          }
      shared_foodie_profile: { Args: { _user_id: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "owner" | "consumer"
      claim_status: "pending" | "approved" | "rejected"
      stop_source:
        | "owner"
        | "apify_event"
        | "apify_post"
        | "apify_maps"
        | "estimated"
        | "own_post"
        | "calendar"
      truck_status: "active" | "pending" | "archived"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "owner", "consumer"],
      claim_status: ["pending", "approved", "rejected"],
      stop_source: [
        "owner",
        "apify_event",
        "apify_post",
        "apify_maps",
        "estimated",
        "own_post",
        "calendar",
      ],
      truck_status: ["active", "pending", "archived"],
    },
  },
} as const
