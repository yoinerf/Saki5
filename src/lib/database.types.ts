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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          created_at: string
          description: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          title: string
          type: string
          user_id: string
          user_role: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          title: string
          type: string
          user_id: string
          user_role: string
        }
        Update: {
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          title?: string
          type?: string
          user_id?: string
          user_role?: string
        }
        Relationships: []
      }
      advertisements: {
        Row: {
          active: boolean
          created_at: string
          ends_at: string
          experience_id: string | null
          id: string
          image_url: string | null
          link_url: string | null
          product_id: string | null
          starts_at: string
          title: string | null
          type: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          ends_at: string
          experience_id?: string | null
          id?: string
          image_url?: string | null
          link_url?: string | null
          product_id?: string | null
          starts_at?: string
          title?: string | null
          type: string
        }
        Update: {
          active?: boolean
          created_at?: string
          ends_at?: string
          experience_id?: string | null
          id?: string
          image_url?: string | null
          link_url?: string | null
          product_id?: string | null
          starts_at?: string
          title?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "advertisements_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advertisements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean
          business_type: string
          created_at: string
          description: string | null
          id: string
          image: string | null
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          business_type: string
          created_at?: string
          description?: string | null
          id?: string
          image?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_type?: string
          created_at?: string
          description?: string | null
          id?: string
          image?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      experiences: {
        Row: {
          capacity: string | null
          category_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          duration: string | null
          featured: boolean | null
          host: string
          host_id: string | null
          id: string
          price: number
          rating: number | null
          reviews: number | null
          tags: string[] | null
          title: string
        }
        Insert: {
          capacity?: string | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration?: string | null
          featured?: boolean | null
          host: string
          host_id?: string | null
          id?: string
          price: number
          rating?: number | null
          reviews?: number | null
          tags?: string[] | null
          title: string
        }
        Update: {
          capacity?: string | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration?: string | null
          featured?: boolean | null
          host?: string
          host_id?: string | null
          id?: string
          price?: number
          rating?: number | null
          reviews?: number | null
          tags?: string[] | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiences_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiences_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiences_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          experience_id: string | null
          id: string
          product_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          experience_id?: string | null
          id?: string
          product_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          experience_id?: string | null
          id?: string
          product_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      images: {
        Row: {
          created_at: string
          experience_id: string | null
          id: string
          image_url: string
          is_primary: boolean
          product_id: string | null
          sort_order: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          experience_id?: string | null
          id?: string
          image_url: string
          is_primary?: boolean
          product_id?: string | null
          sort_order?: number
          storage_path: string
        }
        Update: {
          created_at?: string
          experience_id?: string | null
          id?: string
          image_url?: string
          is_primary?: boolean
          product_id?: string | null
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "images_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_status_history: {
        Row: {
          changed_by: string | null
          changed_by_name: string | null
          changed_by_role: string | null
          created_at: string
          from_status_id: number | null
          id: string
          order_id: string
          order_item_id: string
          to_status_id: number
        }
        Insert: {
          changed_by?: string | null
          changed_by_name?: string | null
          changed_by_role?: string | null
          created_at?: string
          from_status_id?: number | null
          id?: string
          order_id: string
          order_item_id: string
          to_status_id: number
        }
        Update: {
          changed_by?: string | null
          changed_by_name?: string | null
          changed_by_role?: string | null
          created_at?: string
          from_status_id?: number | null
          id?: string
          order_id?: string
          order_item_id?: string
          to_status_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_item_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_status_history_from_status_id_fkey"
            columns: ["from_status_id"]
            isOneToOne: false
            referencedRelation: "order_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_status_history_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_status_history_to_status_id_fkey"
            columns: ["to_status_id"]
            isOneToOne: false
            referencedRelation: "order_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          experience_id: string | null
          id: string
          img: string | null
          item_type: string
          order_id: string
          payment_status: string
          product_id: string | null
          quantity: number
          seller_id: string | null
          status_id: number
          title: string
          total: number
          unit_price: number
          updated_at: string
          variant_id: string | null
          variant_label: string | null
        }
        Insert: {
          created_at?: string
          experience_id?: string | null
          id?: string
          img?: string | null
          item_type?: string
          order_id: string
          payment_status?: string
          product_id?: string | null
          quantity: number
          seller_id?: string | null
          status_id: number
          title: string
          total: number
          unit_price: number
          updated_at?: string
          variant_id?: string | null
          variant_label?: string | null
        }
        Update: {
          created_at?: string
          experience_id?: string | null
          id?: string
          img?: string | null
          item_type?: string
          order_id?: string
          payment_status?: string
          product_id?: string | null
          quantity?: number
          seller_id?: string | null
          status_id?: number
          title?: string
          total?: number
          unit_price?: number
          updated_at?: string
          variant_id?: string | null
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "order_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_transitions: {
        Row: {
          created_at: string
          from_status_id: number
          id: number
          sort_order: number
          store: string
          suggested_for: string[]
          to_status_id: number
        }
        Insert: {
          created_at?: string
          from_status_id: number
          id?: number
          sort_order?: number
          store?: string
          suggested_for?: string[]
          to_status_id: number
        }
        Update: {
          created_at?: string
          from_status_id?: number
          id?: number
          sort_order?: number
          store?: string
          suggested_for?: string[]
          to_status_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_status_transitions_from_status_id_fkey"
            columns: ["from_status_id"]
            isOneToOne: false
            referencedRelation: "order_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_transitions_to_status_id_fkey"
            columns: ["to_status_id"]
            isOneToOne: false
            referencedRelation: "order_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      order_statuses: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: number
          is_final: boolean
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: number
          is_final?: boolean
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: number
          is_final?: boolean
          name?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          created_at: string
          customer_id: string
          customer_name: string | null
          customer_phone: string | null
          id: string
          payment_method: string
          payment_status: string
          shipping_address: Json | null
          shipping_fee: number
          status_id: number
          store: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          payment_method: string
          payment_status?: string
          shipping_address?: Json | null
          shipping_fee?: number
          status_id: number
          store?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          payment_method?: string
          payment_status?: string
          shipping_address?: Json | null
          shipping_fee?: number
          status_id?: number
          store?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_orders_store"
            columns: ["store"]
            isOneToOne: false
            referencedRelation: "store_settings"
            referencedColumns: ["store"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "order_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_documents: {
        Row: {
          created_at: string
          doc_type: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          producer_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          doc_type: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          producer_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          doc_type?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          producer_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "producer_documents_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producer_documents_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producer_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producer_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          comment: string | null
          created_at: string | null
          id: string
          product_id: string
          rating: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          id?: string
          product_id: string
          rating: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          id?: string
          product_id?: string
          rating?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variant_attributes: {
        Row: {
          created_at: string
          id: string
          name: string
          options: string[]
          position: number
          product_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          options: string[]
          position?: number
          product_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          options?: string[]
          position?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_attributes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          active: boolean
          created_at: string
          id: string
          image_storage_path: string | null
          image_url: string | null
          options: Json
          position: number
          price: number | null
          product_id: string
          stock: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          image_storage_path?: string | null
          image_url?: string | null
          options: Json
          position?: number
          price?: number | null
          product_id: string
          stock?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          image_storage_path?: string | null
          image_url?: string | null
          options?: Json
          position?: number
          price?: number | null
          product_id?: string
          stock?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          certified: boolean | null
          created_at: string | null
          created_by: string | null
          description: string | null
          has_variants: boolean
          id: string
          outstanding: boolean | null
          price: number
          producer: string
          producer_id: string | null
          rating: number | null
          reviews: number | null
          stock: string | null
          store: string
          title: string
          unit: string | null
        }
        Insert: {
          category_id?: string | null
          certified?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          has_variants?: boolean
          id?: string
          outstanding?: boolean | null
          price: number
          producer: string
          producer_id?: string | null
          rating?: number | null
          reviews?: number | null
          stock?: string | null
          store?: string
          title: string
          unit?: string | null
        }
        Update: {
          category_id?: string | null
          certified?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          has_variants?: boolean
          id?: string
          outstanding?: boolean | null
          price?: number
          producer?: string
          producer_id?: string | null
          rating?: number | null
          reviews?: number | null
          stock?: string | null
          store?: string
          title?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_products_store"
            columns: ["store"]
            isOneToOne: false
            referencedRelation: "store_settings"
            referencedColumns: ["store"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_roles: {
        Row: {
          created_at: string
          profile_id: string
          role: string
        }
        Insert: {
          created_at?: string
          profile_id: string
          role: string
        }
        Update: {
          created_at?: string
          profile_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_roles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          avatar_path: string | null
          categories: string[] | null
          created_at: string | null
          department: string | null
          document_number: string | null
          document_type: string | null
          email: string
          first_name: string
          id: string
          last_name: string
          manually_verified_at: string | null
          manually_verified_by: string | null
          municipality: string | null
          org_name: string | null
          phone: string | null
          store: string
          user_type: string
        }
        Insert: {
          address?: string | null
          avatar_path?: string | null
          categories?: string[] | null
          created_at?: string | null
          department?: string | null
          document_number?: string | null
          document_type?: string | null
          email: string
          first_name: string
          id: string
          last_name: string
          manually_verified_at?: string | null
          manually_verified_by?: string | null
          municipality?: string | null
          org_name?: string | null
          phone?: string | null
          store?: string
          user_type: string
        }
        Update: {
          address?: string | null
          avatar_path?: string | null
          categories?: string[] | null
          created_at?: string | null
          department?: string | null
          document_number?: string | null
          document_type?: string | null
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          manually_verified_at?: string | null
          manually_verified_by?: string | null
          municipality?: string | null
          org_name?: string | null
          phone?: string | null
          store?: string
          user_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_profiles_store"
            columns: ["store"]
            isOneToOne: false
            referencedRelation: "store_settings"
            referencedColumns: ["store"]
          },
        ]
      }
      store_settings: {
        Row: {
          ally_name: string | null
          active: boolean
          description: string | null
          name: string
          payment_methods: string[]
          payment_timeout_hours: number | null
          shipping_fee: number
          slug: string | null
          sort_order: number
          store: string
          tagline: string | null
          transfer_info: Json
          updated_at: string
        }
        Insert: {
          ally_name?: string | null
          active?: boolean
          description?: string | null
          name: string
          payment_methods?: string[]
          payment_timeout_hours?: number | null
          shipping_fee?: number
          slug?: string | null
          sort_order?: number
          store: string
          tagline?: string | null
          transfer_info?: Json
          updated_at?: string
        }
        Update: {
          ally_name?: string | null
          active?: boolean
          description?: string | null
          name?: string
          payment_methods?: string[]
          payment_timeout_hours?: number | null
          shipping_fee?: number
          slug?: string | null
          sort_order?: number
          store?: string
          tagline?: string | null
          transfer_info?: Json
          updated_at?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          admin_response: string | null
          category: string
          created_at: string
          description: string
          id: string
          order_id: string | null
          order_item_id: string | null
          resolved_at: string | null
          status: string
          subject: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_response?: string | null
          category: string
          created_at?: string
          description: string
          id?: string
          order_id?: string | null
          order_item_id?: string | null
          resolved_at?: string | null
          status?: string
          subject: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_response?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          order_id?: string | null
          order_item_id?: string | null
          resolved_at?: string | null
          status?: string
          subject?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string | null
          id: string
          link_section: string | null
          link_tab: string | null
          read_at: string | null
          store: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          id?: string
          link_section?: string | null
          link_tab?: string | null
          read_at?: string | null
          store?: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          id?: string
          link_section?: string | null
          link_tab?: string | null
          read_at?: string | null
          store?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      product_rating_stats: {
        Row: {
          product_id: string | null
          rating: number | null
          reviews: number | null
        }
        Relationships: []
      }
      public_profiles: {
        Row: {
          first_name: string | null
          id: string | null
          last_name: string | null
          org_name: string | null
        }
        Insert: {
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          org_name?: string | null
        }
        Update: {
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          org_name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_delete_order: {
        Args: { p_order_id: string; p_restock?: boolean }
        Returns: Json
      }
      admin_delete_store: { Args: { p_store: string }; Returns: Json }
      add_my_role: {
        Args: { p_org_name?: string; p_role: string }
        Returns: undefined
      }
      can_store_admin_manage: { Args: { p_user: string }; Returns: boolean }
      cancel_expired_unpaid_orders: { Args: never; Returns: number }
      cancel_unpaid_store_orders: { Args: never; Returns: number }
      complete_my_profile: {
        Args: {
          p_department: string
          p_document_number: string
          p_document_type: string
          p_first_name: string
          p_last_name: string
          p_municipality: string
          p_user_type: string
        }
        Returns: undefined
      }
      create_store_order: {
        Args: {
          p_items: Json
          p_payment_method: string
          p_shipping?: Json
          p_shipping_fee?: number
          p_store: string
        }
        Returns: Json
      }
      current_store_admin_store: { Args: never; Returns: string }
      get_user_role: { Args: { p_user_id: string }; Returns: string }
      has_role: { Args: { p_role: string }; Returns: boolean }
      set_producer_manual_verification: {
        Args: { p_producer: string; p_verified: boolean }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_order_customer: { Args: { p_order_id: string }; Returns: boolean }
      is_order_seller: { Args: { p_order_id: string }; Returns: boolean }
      my_password_change_required: { Args: never; Returns: boolean }
      is_producer_validated: { Args: { p_user: string }; Returns: boolean }
      product_variant_label: {
        Args: { p_options: Json; p_product_id: string }
        Returns: string
      }
      recalc_order_from_items: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      save_product_variants: {
        Args: { p_attributes: Json; p_product_id: string; p_variants: Json }
        Returns: Json
      }
      review_producer_document: {
        Args: { p_approve: boolean; p_document_id: string; p_reason?: string }
        Returns: undefined
      }
      submit_producer_document: {
        Args: {
          p_doc_type: string
          p_file_name: string
          p_file_path: string
          p_file_size: number
          p_mime_type: string
        }
        Returns: Json
      }
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
