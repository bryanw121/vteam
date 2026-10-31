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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      app_config: {
        Row: {
          message: string | null
          min_version: string
          platform: string
          store_url: string | null
          updated_at: string
        }
        Insert: {
          message?: string | null
          min_version?: string
          platform: string
          store_url?: string | null
          updated_at?: string
        }
        Update: {
          message?: string | null
          min_version?: string
          platform?: string
          store_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      app_events: {
        Row: {
          anon_id: string | null
          created_at: string
          id: number
          name: string
          platform: string | null
          props: Json
          user_id: string | null
        }
        Insert: {
          anon_id?: string | null
          created_at?: string
          id?: never
          name: string
          platform?: string | null
          props?: Json
          user_id?: string | null
        }
        Update: {
          anon_id?: string | null
          created_at?: string
          id?: never
          name?: string
          platform?: string | null
          props?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      app_events_daily: {
        Row: {
          day: string
          events: number
          name: string
          people: number
          platform: string
          updated_at: string
        }
        Insert: {
          day: string
          events: number
          name: string
          people: number
          platform?: string
          updated_at?: string
        }
        Update: {
          day?: string
          events?: number
          name?: string
          people?: number
          platform?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_silences: {
        Row: {
          created_at: string
          silenced_user_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          silenced_user_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          silenced_user_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_silences_silenced_user_id_fkey"
            columns: ["silenced_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_silences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cheers: {
        Row: {
          cheer_type: string
          created_at: string
          event_id: string
          giver_id: string
          id: string
          receiver_id: string
        }
        Insert: {
          cheer_type: string
          created_at?: string
          event_id: string
          giver_id: string
          id?: string
          receiver_id: string
        }
        Update: {
          cheer_type?: string
          created_at?: string
          event_id?: string
          giver_id?: string
          id?: string
          receiver_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kudos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kudos_giver_id_fkey"
            columns: ["giver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kudos_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_members: {
        Row: {
          club_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          club_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          club_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_members_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_post_comments: {
        Row: {
          body: string
          club_post_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          body: string
          club_post_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          body?: string
          club_post_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_post_comments_club_post_id_fkey"
            columns: ["club_post_id"]
            isOneToOne: false
            referencedRelation: "club_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_post_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_post_likes: {
        Row: {
          club_post_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          club_post_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          club_post_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_post_likes_club_post_id_fkey"
            columns: ["club_post_id"]
            isOneToOne: false
            referencedRelation: "club_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_posts: {
        Row: {
          body: string
          club_id: string
          created_at: string
          created_by: string
          id: string
        }
        Insert: {
          body: string
          club_id: string
          created_at?: string
          created_by: string
          id?: string
        }
        Update: {
          body?: string
          club_id?: string
          created_at?: string
          created_by?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_posts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          avatar_url: string | null
          cover_url: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          major_city_id: string
          membership_type: string
          name: string
        }
        Insert: {
          avatar_url?: string | null
          cover_url?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          major_city_id: string
          membership_type?: string
          name: string
        }
        Update: {
          avatar_url?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          major_city_id?: string
          membership_type?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "clubs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_major_city_id_fkey"
            columns: ["major_city_id"]
            isOneToOne: false
            referencedRelation: "major_cities"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: string
          joined_at: string
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          club_id: string | null
          created_at: string
          id: string
          type: string
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          id?: string
          type: string
        }
        Update: {
          club_id?: string | null
          created_at?: string
          id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      event_attendees: {
        Row: {
          denial_reason: string | null
          event_id: string
          joined_at: string | null
          status: string
          team_number: number | null
          team_pinned: boolean
          user_id: string
        }
        Insert: {
          denial_reason?: string | null
          event_id: string
          joined_at?: string | null
          status?: string
          team_number?: number | null
          team_pinned?: boolean
          user_id: string
        }
        Update: {
          denial_reason?: string | null
          event_id?: string
          joined_at?: string | null
          status?: string
          team_number?: number | null
          team_pinned?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_cohosts: {
        Row: {
          added_at: string
          added_by: string
          event_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by: string
          event_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string
          event_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_cohosts_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_cohosts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_cohosts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_comments: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          event_id: string
          id: string
          is_announcement: boolean
          mentions: string[]
          parent_id: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          event_id: string
          id?: string
          is_announcement?: boolean
          mentions?: string[]
          parent_id?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          event_id?: string
          id?: string
          is_announcement?: boolean
          mentions?: string[]
          parent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_comments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "event_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_guests: {
        Row: {
          added_by: string
          event_id: string
          first_name: string
          id: string
          joined_at: string
          last_name: string
          status: string
          team_number: number | null
          team_pinned: boolean
        }
        Insert: {
          added_by: string
          event_id: string
          first_name: string
          id?: string
          joined_at?: string
          last_name: string
          status?: string
          team_number?: number | null
          team_pinned?: boolean
        }
        Update: {
          added_by?: string
          event_id?: string
          first_name?: string
          id?: string
          joined_at?: string
          last_name?: string
          status?: string
          team_number?: number | null
          team_pinned?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "event_guests_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_guests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tags: {
        Row: {
          event_id: string
          tag_id: string
        }
        Insert: {
          event_id: string
          tag_id: string
        }
        Update: {
          event_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_tags_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          cancelled_at: string | null
          club_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          duration_minutes: number
          event_date: string
          id: string
          latitude: number | null
          location: string | null
          longitude: number | null
          max_attendees: number | null
          price: number | null
          requires_approval: boolean
          skill_levels: string[]
          surface: string | null
          title: string
          venmo_handle: string | null
        }
        Insert: {
          cancelled_at?: string | null
          club_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          event_date: string
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          max_attendees?: number | null
          price?: number | null
          requires_approval?: boolean
          skill_levels?: string[]
          surface?: string | null
          title: string
          venmo_handle?: string | null
        }
        Update: {
          cancelled_at?: string | null
          club_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          event_date?: string
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          max_attendees?: number | null
          price?: number | null
          requires_approval?: boolean
          skill_levels?: string[]
          surface?: string | null
          title?: string
          venmo_handle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      external_sessions: {
        Row: {
          canceled: boolean
          city: string | null
          ends_at: string | null
          id: string
          level: string | null
          note: string | null
          price: string | null
          region: string
          session_type: string | null
          signup_label: string | null
          signup_url: string | null
          source_id: string
          starts_at: string
          surface: string | null
          title: string
          updated_at: string
          venue: string
          verified_at: string | null
        }
        Insert: {
          canceled?: boolean
          city?: string | null
          ends_at?: string | null
          id: string
          level?: string | null
          note?: string | null
          price?: string | null
          region?: string
          session_type?: string | null
          signup_label?: string | null
          signup_url?: string | null
          source_id: string
          starts_at: string
          surface?: string | null
          title: string
          updated_at?: string
          venue: string
          verified_at?: string | null
        }
        Update: {
          canceled?: boolean
          city?: string | null
          ends_at?: string | null
          id?: string
          level?: string | null
          note?: string | null
          price?: string | null
          region?: string
          session_type?: string | null
          signup_label?: string | null
          signup_url?: string | null
          source_id?: string
          starts_at?: string
          surface?: string | null
          title?: string
          updated_at?: string
          venue?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      feedback_submissions: {
        Row: {
          created_at: string
          description: string
          id: string
          kind: string
          priority: string
          repro_steps: string | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          kind: string
          priority: string
          repro_steps?: string | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          kind?: string
          priority?: string
          repro_steps?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      major_cities: {
        Row: {
          admin_region: string | null
          city_name: string
          country_code: string
          display_name: string
          id: string
        }
        Insert: {
          admin_region?: string | null
          city_name: string
          country_code?: string
          display_name: string
          id?: string
        }
        Update: {
          admin_region?: string | null
          city_name?: string
          country_code?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          image_url: string | null
          mentions: string[]
          reply_to_id: string | null
          sender_id: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          image_url?: string | null
          mentions?: string[]
          reply_to_id?: string | null
          sender_id: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          image_url?: string | null
          mentions?: string[]
          reply_to_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          data: Json
          id: string
          notification_type: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          data?: Json
          id?: string
          notification_type: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json
          id?: string
          notification_type?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          first_name: string | null
          id: string
          is_admin: boolean
          last_name: string | null
          notification_prefs: Json
          position: string[] | null
          selected_border: string | null
          selected_card_bg: string | null
          skill_level: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          first_name?: string | null
          id: string
          is_admin?: boolean
          last_name?: string | null
          notification_prefs?: Json
          position?: string[] | null
          selected_border?: string | null
          selected_card_bg?: string | null
          skill_level?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          first_name?: string | null
          id?: string
          is_admin?: boolean
          last_name?: string | null
          notification_prefs?: Json
          position?: string[] | null
          selected_border?: string | null
          selected_card_bg?: string | null
          skill_level?: string | null
          username?: string | null
        }
        Relationships: []
      }
      push_receipts: {
        Row: {
          created_at: string
          ticket_id: string
          token: string
        }
        Insert: {
          created_at?: string
          ticket_id: string
          token: string
        }
        Update: {
          created_at?: string
          ticket_id?: string
          token?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          category: string
          created_at: string | null
          display_order: number
          id: string
          name: string
        }
        Insert: {
          category: string
          created_at?: string | null
          display_order?: number
          id?: string
          name: string
        }
        Update: {
          category?: string
          created_at?: string | null
          display_order?: number
          id?: string
          name?: string
        }
        Relationships: []
      }
      tournament_comments: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          is_announcement: boolean
          mentions: string[]
          parent_id: string | null
          tournament_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_announcement?: boolean
          mentions?: string[]
          parent_id?: string | null
          tournament_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_announcement?: boolean
          mentions?: string[]
          parent_id?: string | null
          tournament_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tournament_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_comments_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_matches: {
        Row: {
          bracket_round_name: string | null
          court: string | null
          created_at: string
          id: string
          is_losers_bracket: boolean
          match_number: number
          pool_id: string | null
          ref_team_id: string | null
          round: number
          scheduled_at: string | null
          stage: string
          status: string
          team_a_id: string | null
          team_b_id: string | null
          tournament_id: string
          winner_id: string | null
        }
        Insert: {
          bracket_round_name?: string | null
          court?: string | null
          created_at?: string
          id?: string
          is_losers_bracket?: boolean
          match_number: number
          pool_id?: string | null
          ref_team_id?: string | null
          round: number
          scheduled_at?: string | null
          stage: string
          status?: string
          team_a_id?: string | null
          team_b_id?: string | null
          tournament_id: string
          winner_id?: string | null
        }
        Update: {
          bracket_round_name?: string | null
          court?: string | null
          created_at?: string
          id?: string
          is_losers_bracket?: boolean
          match_number?: number
          pool_id?: string | null
          ref_team_id?: string | null
          round?: number
          scheduled_at?: string | null
          stage?: string
          status?: string
          team_a_id?: string | null
          team_b_id?: string | null
          tournament_id?: string
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_matches_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "tournament_pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_ref_team_id_fkey"
            columns: ["ref_team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_team_a_id_fkey"
            columns: ["team_a_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_team_b_id_fkey"
            columns: ["team_b_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_pool_teams: {
        Row: {
          pool_id: string
          team_id: string
        }
        Insert: {
          pool_id: string
          team_id: string
        }
        Update: {
          pool_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_pool_teams_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "tournament_pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_pool_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_pools: {
        Row: {
          display_order: number
          id: string
          name: string
          tournament_id: string
        }
        Insert: {
          display_order?: number
          id?: string
          name: string
          tournament_id: string
        }
        Update: {
          display_order?: number
          id?: string
          name?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_pools_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_prizes: {
        Row: {
          amount: string | null
          created_at: string
          description: string
          display_order: number
          id: string
          place_label: string
          tournament_id: string
        }
        Insert: {
          amount?: string | null
          created_at?: string
          description: string
          display_order?: number
          id?: string
          place_label: string
          tournament_id: string
        }
        Update: {
          amount?: string | null
          created_at?: string
          description?: string
          display_order?: number
          id?: string
          place_label?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_prizes_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_rules: {
        Row: {
          deciding_set_score: number
          point_cap: number | null
          sets_to_win: number
          starting_score: number
          tournament_id: string
          win_by_margin: number
          winning_score: number
        }
        Insert: {
          deciding_set_score?: number
          point_cap?: number | null
          sets_to_win?: number
          starting_score?: number
          tournament_id: string
          win_by_margin?: number
          winning_score?: number
        }
        Update: {
          deciding_set_score?: number
          point_cap?: number | null
          sets_to_win?: number
          starting_score?: number
          tournament_id?: string
          win_by_margin?: number
          winning_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "tournament_rules_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: true
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_sets: {
        Row: {
          completed_at: string | null
          id: string
          match_id: string
          set_number: number
          team_a_score: number
          team_b_score: number
        }
        Insert: {
          completed_at?: string | null
          id?: string
          match_id: string
          set_number: number
          team_a_score?: number
          team_b_score?: number
        }
        Update: {
          completed_at?: string | null
          id?: string
          match_id?: string
          set_number?: number
          team_a_score?: number
          team_b_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "tournament_sets_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "tournament_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_team_invitations: {
        Row: {
          created_at: string
          id: string
          invitee_id: string
          inviter_id: string
          status: string
          team_id: string
          tournament_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invitee_id: string
          inviter_id: string
          status?: string
          team_id: string
          tournament_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          status?: string
          team_id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_team_invitations_invitee_id_fkey"
            columns: ["invitee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_team_invitations_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_team_invitations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_team_invitations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_team_join_requests: {
        Row: {
          created_at: string
          id: string
          requester_id: string
          status: string
          team_id: string
          tournament_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          requester_id: string
          status?: string
          team_id: string
          tournament_id: string
        }
        Update: {
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
          team_id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_team_join_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_team_join_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_team_join_requests_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_team_members: {
        Row: {
          id: string
          is_captain: boolean
          joined_at: string
          team_id: string
          user_id: string
        }
        Insert: {
          id?: string
          is_captain?: boolean
          joined_at?: string
          team_id: string
          user_id: string
        }
        Update: {
          id?: string
          is_captain?: boolean
          joined_at?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_teams: {
        Row: {
          captain_user_id: string | null
          created_at: string
          id: string
          is_approved: boolean
          is_locked: boolean
          is_paid: boolean
          name: string
          seed: number | null
          status: string
          tournament_id: string
        }
        Insert: {
          captain_user_id?: string | null
          created_at?: string
          id?: string
          is_approved?: boolean
          is_locked?: boolean
          is_paid?: boolean
          name: string
          seed?: number | null
          status?: string
          tournament_id: string
        }
        Update: {
          captain_user_id?: string | null
          created_at?: string
          id?: string
          is_approved?: boolean
          is_locked?: boolean
          is_paid?: boolean
          name?: string
          seed?: number | null
          status?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_teams_captain_user_id_fkey"
            columns: ["captain_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_teams_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          bracket_type: string | null
          break_duration_minutes: number
          cancelled_at: string | null
          club_id: string
          created_at: string
          created_by: string
          description: string | null
          format: string
          has_refs: boolean
          id: string
          location: string | null
          match_duration_minutes: number
          max_roster_size: number
          max_teams: number | null
          min_roster_size: number
          num_courts: number
          price: number
          published_at: string | null
          registration_deadline: string | null
          schedule_generated_at: string | null
          schedule_published: boolean
          skill_levels: string[]
          start_date: string
          status: string
          teams_advance_per_pool: number
          title: string
          venmo_handle: string | null
        }
        Insert: {
          bracket_type?: string | null
          break_duration_minutes?: number
          cancelled_at?: string | null
          club_id: string
          created_at?: string
          created_by: string
          description?: string | null
          format: string
          has_refs?: boolean
          id?: string
          location?: string | null
          match_duration_minutes?: number
          max_roster_size?: number
          max_teams?: number | null
          min_roster_size?: number
          num_courts?: number
          price?: number
          published_at?: string | null
          registration_deadline?: string | null
          schedule_generated_at?: string | null
          schedule_published?: boolean
          skill_levels?: string[]
          start_date: string
          status?: string
          teams_advance_per_pool?: number
          title: string
          venmo_handle?: string | null
        }
        Update: {
          bracket_type?: string | null
          break_duration_minutes?: number
          cancelled_at?: string | null
          club_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          format?: string
          has_refs?: boolean
          id?: string
          location?: string | null
          match_duration_minutes?: number
          max_roster_size?: number
          max_teams?: number | null
          min_roster_size?: number
          num_courts?: number
          price?: number
          published_at?: string | null
          registration_deadline?: string | null
          schedule_generated_at?: string | null
          schedule_published?: boolean
          skill_levels?: string[]
          start_date?: string
          status?: string
          teams_advance_per_pool?: number
          title?: string
          venmo_handle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          awarded_at: string
          badge_type: string
          display_order: number | null
          display_tier: number | null
          id: string
          tier: number
          user_id: string
        }
        Insert: {
          awarded_at?: string
          badge_type: string
          display_order?: number | null
          display_tier?: number | null
          id?: string
          tier?: number
          user_id: string
        }
        Update: {
          awarded_at?: string
          badge_type?: string
          display_order?: number | null
          display_tier?: number | null
          id?: string
          tier?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_event_templates: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          location: string | null
          max_attendees: number | null
          name: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          location?: string | null
          max_attendees?: number | null
          name: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          location?: string | null
          max_attendees?: number | null
          name?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_event_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          home_city_id: string | null
          seen_banners: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          home_city_id?: string | null
          seen_banners?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          home_city_id?: string | null
          seen_banners?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_home_city_id_fkey"
            columns: ["home_city_id"]
            isOneToOne: false
            referencedRelation: "major_cities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      event_attendees_attending: {
        Row: {
          event_id: string | null
          joined_at: string | null
          status: string | null
          team_number: number | null
          team_pinned: boolean | null
          user_id: string | null
        }
        Insert: {
          event_id?: string | null
          joined_at?: string | null
          status?: string | null
          team_number?: number | null
          team_pinned?: boolean | null
          user_id?: string | null
        }
        Update: {
          event_id?: string | null
          joined_at?: string | null
          status?: string | null
          team_number?: number | null
          team_pinned?: boolean | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_attendees_waitlisted: {
        Row: {
          event_id: string | null
          joined_at: string | null
          status: string | null
          team_number: number | null
          team_pinned: boolean | null
          user_id: string | null
        }
        Insert: {
          event_id?: string | null
          joined_at?: string | null
          status?: string | null
          team_number?: number | null
          team_pinned?: boolean | null
          user_id?: string | null
        }
        Update: {
          event_id?: string | null
          joined_at?: string | null
          status?: string | null
          team_number?: number | null
          team_pinned?: boolean | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_guests_attending: {
        Row: {
          added_by: string | null
          event_id: string | null
          first_name: string | null
          id: string | null
          joined_at: string | null
          last_name: string | null
          status: string | null
        }
        Insert: {
          added_by?: string | null
          event_id?: string | null
          first_name?: string | null
          id?: string | null
          joined_at?: string | null
          last_name?: string | null
          status?: string | null
        }
        Update: {
          added_by?: string | null
          event_id?: string | null
          first_name?: string | null
          id?: string | null
          joined_at?: string | null
          last_name?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_guests_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_guests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_tournament_invite: {
        Args: { p_invite_id: string }
        Returns: string
      }
      find_or_create_dm: { Args: { other_user_id: string }; Returns: string }
      get_chat_unread_count: { Args: never; Returns: number }
      get_email_by_username: { Args: { p_username: string }; Returns: string }
      get_event_card_attendee_previews: {
        Args: { p_event_ids: string[] }
        Returns: {
          avatar_url: string
          event_id: string
          first_name: string
          last_name: string
          user_id: string
          username: string
        }[]
      }
      get_feed_span: {
        Args: {
          p_end: string
          p_external_updated_since?: string
          p_start: string
        }
        Returns: Json
      }
      get_my_conversations: {
        Args: never
        Returns: {
          club_avatar_url: string
          club_id: string
          club_name: string
          conversation_id: string
          created_at: string
          last_message_at: string
          last_message_content: string
          last_message_deleted_at: string
          last_message_id: string
          last_message_image_url: string
          last_sender_first_name: string
          last_sender_id: string
          last_sender_last_name: string
          last_sender_username: string
          my_last_read_at: string
          other_user_avatar_url: string
          other_user_first_name: string
          other_user_id: string
          other_user_last_name: string
          other_user_selected_border: string
          other_user_username: string
          type: string
          unread_count: number
        }[]
      }
      ingest_schelagg_feed: { Args: never; Returns: number }
      is_club_owner: { Args: { p_club_id: string }; Returns: boolean }
      is_conversation_member: { Args: { conv_id: string }; Returns: boolean }
      mark_all_notifications_read: { Args: never; Returns: undefined }
      mark_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      notification_pref_enabled: {
        Args: {
          p_channel: string
          p_notification_type: string
          p_user_id: string
        }
        Returns: boolean
      }
      replace_tournament_schedule: {
        Args: { p_matches: Json; p_pools?: Json; p_tournament_id: string }
        Returns: number
      }
      rollup_app_events: { Args: { p_days?: number }; Returns: number }
      schema_fingerprint: { Args: never; Returns: Json }
      schema_pending_changes: { Args: never; Returns: Json }
      send_kudos_reminders: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
