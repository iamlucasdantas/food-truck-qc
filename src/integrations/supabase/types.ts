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
      ingestion_runs: {
        Row: {
          cities_done: string[]
          cities_total: string[]
          error: string | null
          finished_at: string | null
          id: string
          items_created: number
          items_found: number
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
          notes?: string | null
          source?: string
          started_at?: string
          status?: string
        }
        Relationships: []
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
          repeat_group: string | null
          source: Database["public"]["Enums"]["stop_source"]
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
          repeat_group?: string | null
          source?: Database["public"]["Enums"]["stop_source"]
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
          repeat_group?: string | null
          source?: Database["public"]["Enums"]["stop_source"]
          starts_at?: string
          truck_id?: string
          venue_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "stops_truck_id_fkey"
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
          category: string
          claimed_by: string | null
          created_at: string
          created_by: string | null
          description: string
          emoji: string
          facebook: string | null
          google_place_id: string | null
          id: string
          instagram: string | null
          logo_url: string | null
          menu: Json
          merged_into: string | null
          name: string
          phone: string | null
          source: string
          status: Database["public"]["Enums"]["truck_status"]
          website: string | null
        }
        Insert: {
          accepts_card?: boolean
          base_address?: string | null
          base_lat?: number | null
          base_lng?: number | null
          category?: string
          claimed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          emoji?: string
          facebook?: string | null
          google_place_id?: string | null
          id: string
          instagram?: string | null
          logo_url?: string | null
          menu?: Json
          merged_into?: string | null
          name: string
          phone?: string | null
          source?: string
          status?: Database["public"]["Enums"]["truck_status"]
          website?: string | null
        }
        Update: {
          accepts_card?: boolean
          base_address?: string | null
          base_lat?: number | null
          base_lng?: number | null
          category?: string
          claimed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          emoji?: string
          facebook?: string | null
          google_place_id?: string | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          menu?: Json
          merged_into?: string | null
          name?: string
          phone?: string | null
          source?: string
          status?: Database["public"]["Enums"]["truck_status"]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      owns_truck: { Args: { _truck_id: string }; Returns: boolean }
      review_claim:
        | { Args: { _approve: boolean; _claim_id: string }; Returns: undefined }
        | {
            Args: { _approve: boolean; _claim_id: string; _reason: string }
            Returns: undefined
          }
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
      ],
      truck_status: ["active", "pending", "archived"],
    },
  },
} as const
