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
      accounting_settings: {
        Row: {
          accounting_start_date: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          accounting_start_date?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          accounting_start_date?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      cash_transfers: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          from_account: string
          id: string
          notes: string | null
          to_account: string
          transfer_date: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          from_account: string
          id?: string
          notes?: string | null
          to_account: string
          transfer_date?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          from_account?: string
          id?: string
          notes?: string | null
          to_account?: string
          transfer_date?: string
        }
        Relationships: []
      }
      chart_of_accounts: {
        Row: {
          account_name: string
          account_type: string
          classification_type: string
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          normal_balance: string
          sub_type: string
          updated_at: string
        }
        Insert: {
          account_name: string
          account_type: string
          classification_type?: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          normal_balance: string
          sub_type?: string
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_type?: string
          classification_type?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          normal_balance?: string
          sub_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_loyalty: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          points_balance: number
          total_earned: number
          total_redeemed: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          points_balance?: number
          total_earned?: number
          total_redeemed?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          points_balance?: number
          total_earned?: number
          total_redeemed?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_loyalty_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_notes: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          note_text: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          note_text: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          note_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          country_code: string | null
          created_at: string
          customer_type: string
          full_name: string
          full_phone_e164: string | null
          id: string
          is_active: boolean
          local_phone: string | null
          notes: string | null
          phone_number: string
          updated_at: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          customer_type?: string
          full_name: string
          full_phone_e164?: string | null
          id?: string
          is_active?: boolean
          local_phone?: string | null
          notes?: string | null
          phone_number: string
          updated_at?: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          customer_type?: string
          full_name?: string
          full_phone_e164?: string | null
          id?: string
          is_active?: boolean
          local_phone?: string | null
          notes?: string | null
          phone_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      depreciation_entries: {
        Row: {
          amount: number
          asset_id: string
          created_at: string
          id: string
          journal_entry_id: string | null
          period_month: string
        }
        Insert: {
          amount?: number
          asset_id: string
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          period_month: string
        }
        Update: {
          amount?: number
          asset_id?: string
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          period_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "depreciation_entries_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_payments: {
        Row: {
          amount: number
          created_at: string
          expense_id: string
          id: string
          notes: string | null
          payment_date: string
          payment_source: string
        }
        Insert: {
          amount?: number
          created_at?: string
          expense_id: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_source?: string
        }
        Update: {
          amount?: number
          created_at?: string
          expense_id?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_payments_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          bank_amount: number
          billing_day: number | null
          cash_amount: number
          category: string
          created_at: string
          description: string
          due_date: string | null
          expense_date: string
          expense_status: string
          id: string
          income_category: string
          is_auto_generated: boolean
          is_recurring: boolean
          last_run_date: string | null
          next_run_date: string | null
          paid_amount: number
          parent_recurring_id: string | null
          payment_source: string
          pl_line: string
          recurring_period: string | null
          remaining_amount: number
          updated_at: string
        }
        Insert: {
          amount?: number
          bank_amount?: number
          billing_day?: number | null
          cash_amount?: number
          category?: string
          created_at?: string
          description?: string
          due_date?: string | null
          expense_date?: string
          expense_status?: string
          id?: string
          income_category?: string
          is_auto_generated?: boolean
          is_recurring?: boolean
          last_run_date?: string | null
          next_run_date?: string | null
          paid_amount?: number
          parent_recurring_id?: string | null
          payment_source?: string
          pl_line?: string
          recurring_period?: string | null
          remaining_amount?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_amount?: number
          billing_day?: number | null
          cash_amount?: number
          category?: string
          created_at?: string
          description?: string
          due_date?: string | null
          expense_date?: string
          expense_status?: string
          id?: string
          income_category?: string
          is_auto_generated?: boolean
          is_recurring?: boolean
          last_run_date?: string | null
          next_run_date?: string | null
          paid_amount?: number
          parent_recurring_id?: string | null
          payment_source?: string
          pl_line?: string
          recurring_period?: string | null
          remaining_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      fixed_assets: {
        Row: {
          asset_account_code: string
          asset_name: string
          category: string
          contra_account_code: string
          cost: number
          created_at: string
          depreciation_method: string
          expense_account_code: string
          funding_source: string
          id: string
          invoice_url: string | null
          is_deleted: boolean
          notes: string | null
          purchase_date: string
          residual_value: number
          status: string
          updated_at: string
          useful_life_years: number
        }
        Insert: {
          asset_account_code?: string
          asset_name: string
          category?: string
          contra_account_code?: string
          cost?: number
          created_at?: string
          depreciation_method?: string
          expense_account_code?: string
          funding_source?: string
          id?: string
          invoice_url?: string | null
          is_deleted?: boolean
          notes?: string | null
          purchase_date?: string
          residual_value?: number
          status?: string
          updated_at?: string
          useful_life_years?: number
        }
        Update: {
          asset_account_code?: string
          asset_name?: string
          category?: string
          contra_account_code?: string
          cost?: number
          created_at?: string
          depreciation_method?: string
          expense_account_code?: string
          funding_source?: string
          id?: string
          invoice_url?: string | null
          is_deleted?: boolean
          notes?: string | null
          purchase_date?: string
          residual_value?: number
          status?: string
          updated_at?: string
          useful_life_years?: number
        }
        Relationships: []
      }
      internal_order_notes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note_text: string
          order_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note_text: string
          order_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note_text?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_order_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          item_name: string
          item_name_ar: string | null
          show_in_quick_add: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          item_name: string
          item_name_ar?: string | null
          show_in_quick_add?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          item_name?: string
          item_name_ar?: string | null
          show_in_quick_add?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          created_at: string
          description: string
          entry_date: string
          id: string
          is_system: boolean
          source_id: string | null
          source_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          entry_date?: string
          id?: string
          is_system?: boolean
          source_id?: string | null
          source_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          entry_date?: string
          id?: string
          is_system?: boolean
          source_id?: string | null
          source_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      journal_entry_lines: {
        Row: {
          amount: number
          created_at: string
          credit_account_id: string | null
          debit_account_id: string | null
          entry_id: string
          id: string
          line_description: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          credit_account_id?: string | null
          debit_account_id?: string | null
          entry_id: string
          id?: string
          line_description?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          credit_account_id?: string | null
          debit_account_id?: string | null
          entry_id?: string
          id?: string
          line_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_debit_account_id_fkey"
            columns: ["debit_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_debit_account_id_fkey"
            columns: ["debit_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_installments: {
        Row: {
          created_at: string
          due_date: string
          id: string
          installment_no: number
          interest_amount: number
          is_paid: boolean
          loan_id: string
          paid_amount: number
          principal_amount: number
          remaining_balance: number
          total_amount: number
        }
        Insert: {
          created_at?: string
          due_date: string
          id?: string
          installment_no: number
          interest_amount?: number
          is_paid?: boolean
          loan_id: string
          paid_amount?: number
          principal_amount?: number
          remaining_balance?: number
          total_amount?: number
        }
        Update: {
          created_at?: string
          due_date?: string
          id?: string
          installment_no?: number
          interest_amount?: number
          is_paid?: boolean
          loan_id?: string
          paid_amount?: number
          principal_amount?: number
          remaining_balance?: number
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "loan_installments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          installment_id: string | null
          interest_portion: number
          loan_id: string
          notes: string | null
          payment_date: string
          payment_source: string
          principal_portion: number
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          installment_id?: string | null
          interest_portion?: number
          loan_id: string
          notes?: string | null
          payment_date?: string
          payment_source?: string
          principal_portion?: number
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          installment_id?: string | null
          interest_portion?: number
          loan_id?: string
          notes?: string | null
          payment_date?: string
          payment_source?: string
          principal_portion?: number
        }
        Relationships: [
          {
            foreignKeyName: "loan_payments_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "loan_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_payments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          annual_interest_rate: number
          attachment_url: string | null
          bank_name: string
          created_at: string
          disbursement_account_code: string
          first_disbursement_date: string | null
          id: string
          installment_amount: number
          interest_expense_code: string
          is_deleted: boolean
          liability_account_code: string
          loan_name: string
          loan_type: string
          next_payment_date: string | null
          notes: string | null
          original_principal: number
          outstanding_balance: number
          payment_frequency: string
          principal: number
          start_date: string
          status: string
          term_months: number
          updated_at: string
        }
        Insert: {
          annual_interest_rate?: number
          attachment_url?: string | null
          bank_name?: string
          created_at?: string
          disbursement_account_code?: string
          first_disbursement_date?: string | null
          id?: string
          installment_amount?: number
          interest_expense_code?: string
          is_deleted?: boolean
          liability_account_code?: string
          loan_name: string
          loan_type?: string
          next_payment_date?: string | null
          notes?: string | null
          original_principal?: number
          outstanding_balance?: number
          payment_frequency?: string
          principal?: number
          start_date?: string
          status?: string
          term_months?: number
          updated_at?: string
        }
        Update: {
          annual_interest_rate?: number
          attachment_url?: string | null
          bank_name?: string
          created_at?: string
          disbursement_account_code?: string
          first_disbursement_date?: string | null
          id?: string
          installment_amount?: number
          interest_expense_code?: string
          is_deleted?: boolean
          liability_account_code?: string
          loan_name?: string
          loan_type?: string
          next_payment_date?: string | null
          notes?: string | null
          original_principal?: number
          outstanding_balance?: number
          payment_frequency?: string
          principal?: number
          start_date?: string
          status?: string
          term_months?: number
          updated_at?: string
        }
        Relationships: []
      }
      loyalty_settings: {
        Row: {
          created_at: string
          earn_points_rate: number
          id: string
          is_enabled: boolean
          loyalty_start_date: string | null
          max_redemption_percent: number
          min_redeem_points: number
          points_validity_days: number | null
          redeem_points_rate: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          earn_points_rate?: number
          id?: string
          is_enabled?: boolean
          loyalty_start_date?: string | null
          max_redemption_percent?: number
          min_redeem_points?: number
          points_validity_days?: number | null
          redeem_points_rate?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          earn_points_rate?: number
          id?: string
          is_enabled?: boolean
          loyalty_start_date?: string | null
          max_redemption_percent?: number
          min_redeem_points?: number
          points_validity_days?: number | null
          redeem_points_rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      loyalty_transactions: {
        Row: {
          created_at: string
          customer_id: string
          description: string | null
          expires_at: string | null
          id: string
          order_id: string | null
          points: number
          remaining_points: number
          type: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          description?: string | null
          expires_at?: string | null
          id?: string
          order_id?: string | null
          points?: number
          remaining_points?: number
          type?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          order_id?: string | null
          points?: number
          remaining_points?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          channel: string
          created_at: string
          currency: string
          customer_id: string | null
          delivered_at: string | null
          direction: string
          error_code: string | null
          error_message: string | null
          estimated_cost: number
          event_type: string | null
          failed_at: string | null
          id: string
          message_body: string | null
          message_type: string
          order_id: string
          provider_message_id: string | null
          provider_response: string | null
          read_at: string | null
          recipient_phone: string
          send_status: string
          template_category: string | null
          template_language: string | null
          template_name: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          currency?: string
          customer_id?: string | null
          delivered_at?: string | null
          direction?: string
          error_code?: string | null
          error_message?: string | null
          estimated_cost?: number
          event_type?: string | null
          failed_at?: string | null
          id?: string
          message_body?: string | null
          message_type?: string
          order_id: string
          provider_message_id?: string | null
          provider_response?: string | null
          read_at?: string | null
          recipient_phone: string
          send_status?: string
          template_category?: string | null
          template_language?: string | null
          template_name?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          currency?: string
          customer_id?: string | null
          delivered_at?: string | null
          direction?: string
          error_code?: string | null
          error_message?: string | null
          estimated_cost?: number
          event_type?: string | null
          failed_at?: string | null
          id?: string
          message_body?: string | null
          message_type?: string
          order_id?: string
          provider_message_id?: string | null
          provider_response?: string | null
          read_at?: string | null
          recipient_phone?: string
          send_status?: string
          template_category?: string | null
          template_language?: string | null
          template_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      opening_balances: {
        Row: {
          account_type: string
          amount: number
          as_of_date: string
          created_at: string
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          account_type: string
          amount?: number
          as_of_date?: string
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: string
          amount?: number
          as_of_date?: string
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          brand: string | null
          color: string | null
          condition_notes: string | null
          created_at: string
          id: string
          item_type: string
          order_id: string
          quantity: number
          service_type: string
          special_notes: string | null
          total_price: number
          unit_price: number
        }
        Insert: {
          brand?: string | null
          color?: string | null
          condition_notes?: string | null
          created_at?: string
          id?: string
          item_type?: string
          order_id: string
          quantity?: number
          service_type?: string
          special_notes?: string | null
          total_price?: number
          unit_price?: number
        }
        Update: {
          brand?: string | null
          color?: string | null
          condition_notes?: string | null
          created_at?: string
          id?: string
          item_type?: string
          order_id?: string
          quantity?: number
          service_type?: string
          special_notes?: string | null
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_status: string | null
          id: string
          note: string | null
          order_id: string
          to_status: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          note?: string | null
          order_id: string
          to_status: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          note?: string | null
          order_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          current_status: string
          customer_id: string | null
          deleted_at: string | null
          delivery_date: string | null
          discount: number
          employee_id: string | null
          general_notes: string | null
          id: string
          is_deleted: boolean
          is_draft: boolean
          loyalty_whatsapp_sent: boolean
          order_date: string
          order_number: string
          order_type: string
          paid_amount: number
          payment_status: string
          pickup_method: string
          qr_value: string | null
          ready_pickup_whatsapp_sent: boolean
          remaining_amount: number
          subtotal: number
          tax: number
          total_amount: number
          updated_at: string
          urgent_fee: number
        }
        Insert: {
          created_at?: string
          current_status?: string
          customer_id?: string | null
          deleted_at?: string | null
          delivery_date?: string | null
          discount?: number
          employee_id?: string | null
          general_notes?: string | null
          id?: string
          is_deleted?: boolean
          is_draft?: boolean
          loyalty_whatsapp_sent?: boolean
          order_date?: string
          order_number: string
          order_type?: string
          paid_amount?: number
          payment_status?: string
          pickup_method?: string
          qr_value?: string | null
          ready_pickup_whatsapp_sent?: boolean
          remaining_amount?: number
          subtotal?: number
          tax?: number
          total_amount?: number
          updated_at?: string
          urgent_fee?: number
        }
        Update: {
          created_at?: string
          current_status?: string
          customer_id?: string | null
          deleted_at?: string | null
          delivery_date?: string | null
          discount?: number
          employee_id?: string | null
          general_notes?: string | null
          id?: string
          is_deleted?: boolean
          is_draft?: boolean
          loyalty_whatsapp_sent?: boolean
          order_date?: string
          order_number?: string
          order_type?: string
          paid_amount?: number
          payment_status?: string
          pickup_method?: string
          qr_value?: string | null
          ready_pickup_whatsapp_sent?: boolean
          remaining_amount?: number
          subtotal?: number
          tax?: number
          total_amount?: number
          updated_at?: string
          urgent_fee?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_corrections: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          new_amount: number | null
          new_method: string | null
          new_payment_date: string | null
          old_amount: number | null
          old_method: string | null
          old_payment_date: string | null
          order_id: string
          original_payment_id: string | null
          reason: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_amount?: number | null
          new_method?: string | null
          new_payment_date?: string | null
          old_amount?: number | null
          old_method?: string | null
          old_payment_date?: string | null
          order_id: string
          original_payment_id?: string | null
          reason?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_amount?: number | null
          new_method?: string | null
          new_payment_date?: string | null
          old_amount?: number | null
          old_method?: string | null
          old_payment_date?: string | null
          order_id?: string
          original_payment_id?: string | null
          reason?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          order_id: string
          payment_date: string
          payment_method: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          payment_date?: string
          payment_method?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          payment_date?: string
          payment_method?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          app_context: string
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          app_context?: string
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          app_context?: string
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      service_pricing: {
        Row: {
          created_at: string
          currency: string
          display_order: number
          id: string
          is_active: boolean
          is_default_service: boolean
          item_id: string | null
          item_type: string
          notes: string | null
          price: number
          service_id: string | null
          service_type: string
          updated_at: string
          urgent_price: number | null
        }
        Insert: {
          created_at?: string
          currency?: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_default_service?: boolean
          item_id?: string | null
          item_type: string
          notes?: string | null
          price?: number
          service_id?: string | null
          service_type: string
          updated_at?: string
          urgent_price?: number | null
        }
        Update: {
          created_at?: string
          currency?: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_default_service?: boolean
          item_id?: string | null
          item_type?: string
          notes?: string | null
          price?: number
          service_id?: string | null
          service_type?: string
          updated_at?: string
          urgent_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_pricing_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_pricing_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          service_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          service_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          service_name?: string
          updated_at?: string
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
      whatsapp_auto_reply_settings: {
        Row: {
          created_at: string
          fallback_message: string
          greeting_message: string
          id: string
          production_mode: boolean
          test_mode: boolean
          test_number: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          fallback_message?: string
          greeting_message?: string
          id?: string
          production_mode?: boolean
          test_mode?: boolean
          test_number?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          fallback_message?: string
          greeting_message?: string
          id?: string
          production_mode?: boolean
          test_mode?: boolean
          test_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_complaints: {
        Row: {
          attachment_url: string | null
          created_at: string
          customer_id: string | null
          id: string
          internal_notes: string | null
          message: string
          phone: string
          status: string
          updated_at: string
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          internal_notes?: string | null
          message?: string
          phone: string
          status?: string
          updated_at?: string
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          internal_notes?: string | null
          message?: string
          phone?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_conversation_state: {
        Row: {
          id: string
          menu_sent: boolean
          phone: string
          state: string
          updated_at: string
        }
        Insert: {
          id?: string
          menu_sent?: boolean
          phone: string
          state?: string
          updated_at?: string
        }
        Update: {
          id?: string
          menu_sent?: boolean
          phone?: string
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_country_codes: {
        Row: {
          country_code: string
          country_name: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          country_code: string
          country_name: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          country_code?: string
          country_name?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_menu_items: {
        Row: {
          action_type: string
          created_at: string
          id: string
          is_enabled: boolean
          label_ar: string
          label_en: string
          menu_number: number
          reply_key: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          action_type?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          label_ar?: string
          label_en?: string
          menu_number: number
          reply_key?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          label_ar?: string
          label_en?: string
          menu_number?: number
          reply_key?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          created_at: string
          customer_id: string | null
          filename: string | null
          id: string
          is_deleted: boolean
          is_read: boolean
          media_id: string | null
          media_url: string | null
          message: string
          message_timestamp: string | null
          message_type: string
          order_id: string | null
          phone: string
          send_status: string
          type: string
          wa_message_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          filename?: string | null
          id?: string
          is_deleted?: boolean
          is_read?: boolean
          media_id?: string | null
          media_url?: string | null
          message: string
          message_timestamp?: string | null
          message_type?: string
          order_id?: string | null
          phone: string
          send_status?: string
          type?: string
          wa_message_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          filename?: string | null
          id?: string
          is_deleted?: boolean
          is_read?: boolean
          media_id?: string | null
          media_url?: string | null
          message?: string
          message_timestamp?: string | null
          message_type?: string
          order_id?: string | null
          phone?: string
          send_status?: string
          type?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_settings: {
        Row: {
          auto_reply_enabled: boolean
          business_logo_url: string
          business_name: string
          cost_rates: Json
          created_at: string
          default_country_code: string
          default_invoice_language: string
          event_mapping: Json
          graph_api_version: string
          id: string
          include_qr: boolean
          incoming_enabled: boolean
          invoice_footer_text: string
          outstanding_unpaid_cost: number
          push_notifications_enabled: boolean
          receipt_size: string
          templates: Json
          unread_badge_enabled: boolean
          updated_at: string
        }
        Insert: {
          auto_reply_enabled?: boolean
          business_logo_url?: string
          business_name?: string
          cost_rates?: Json
          created_at?: string
          default_country_code?: string
          default_invoice_language?: string
          event_mapping?: Json
          graph_api_version?: string
          id?: string
          include_qr?: boolean
          incoming_enabled?: boolean
          invoice_footer_text?: string
          outstanding_unpaid_cost?: number
          push_notifications_enabled?: boolean
          receipt_size?: string
          templates?: Json
          unread_badge_enabled?: boolean
          updated_at?: string
        }
        Update: {
          auto_reply_enabled?: boolean
          business_logo_url?: string
          business_name?: string
          cost_rates?: Json
          created_at?: string
          default_country_code?: string
          default_invoice_language?: string
          event_mapping?: Json
          graph_api_version?: string
          id?: string
          include_qr?: boolean
          incoming_enabled?: boolean
          invoice_footer_text?: string
          outstanding_unpaid_cost?: number
          push_notifications_enabled?: boolean
          receipt_size?: string
          templates?: Json
          unread_badge_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_static_replies: {
        Row: {
          created_at: string
          id: string
          message_text: string
          reply_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_text?: string
          reply_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          message_text?: string
          reply_key?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      account_balances: {
        Row: {
          account_name: string | null
          account_type: string | null
          balance: number | null
          classification_type: string | null
          code: string | null
          credit_total: number | null
          debit_total: number | null
          description: string | null
          id: string | null
          is_active: boolean | null
          is_system: boolean | null
          normal_balance: string | null
          sub_type: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      assert_journal_entry_balanced: {
        Args: { _entry_id: string }
        Returns: undefined
      }
      audit_loan_journal_entries: {
        Args: never
        Returns: {
          credit_amount: number
          debit_amount: number
          description: string
          entry_date: string
          entry_id: string
          loan_id: string
          loan_name: string
          source_type: string
        }[]
      }
      backfill_missing_asset_purchase_jes: {
        Args: never
        Returns: {
          asset_id: string
          asset_name: string
          posted: boolean
        }[]
      }
      calc_loan_installment: {
        Args: { _annual_rate: number; _months: number; _principal: number }
        Returns: number
      }
      correct_payment: {
        Args: { _payload: Json; _payment_id: string }
        Returns: Json
      }
      delete_system_entries: {
        Args: { _source_id: string; _source_type: string }
        Returns: undefined
      }
      detect_duplicate_loan_postings: {
        Args: never
        Returns: {
          has_disbursement: boolean
          has_opening: boolean
          loan_id: string
          loan_name: string
        }[]
      }
      expense_category_to_account_code: {
        Args: { _category: string }
        Returns: string
      }
      fixed_asset_category_to_codes: {
        Args: { _category: string }
        Returns: {
          asset_code: string
          contra_code: string
        }[]
      }
      funding_source_to_account_code: {
        Args: { _source: string }
        Returns: string
      }
      get_account_id: { Args: { _code: string }; Returns: string }
      get_accounting_start_date: { Args: never; Returns: string }
      get_loan_split_summary: {
        Args: never
        Returns: {
          current_portion: number
          non_current_portion: number
          total_outstanding: number
        }[]
      }
      get_monthly_cash_breakdown: {
        Args: { _account_codes?: string[]; _month_start: string }
        Returns: {
          account_code: string
          credit: number
          debit: number
          description: string
          entry_date: string
          entry_id: string
          line_description: string
          source_type: string
        }[]
      }
      get_monthly_cash_movements: {
        Args: { _account_codes?: string[] }
        Returns: {
          bank_inflows: number
          bank_outflows: number
          cash_inflows: number
          cash_outflows: number
          inflows: number
          month_start: string
          outflows: number
        }[]
      }
      get_opening_balances: {
        Args: never
        Returns: {
          account_id: string
          amount: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      payment_method_to_account_code: {
        Args: { _method: string }
        Returns: string
      }
      post_expense_payment_replay: { Args: { _id: string }; Returns: undefined }
      post_expense_replay: { Args: { _id: string }; Returns: undefined }
      post_fixed_asset_purchase_je: {
        Args: { _asset_id: string }
        Returns: string
      }
      post_loan_disbursement_je: { Args: { _loan_id: string }; Returns: string }
      post_loan_payment_je: { Args: { _payment_id: string }; Returns: string }
      post_opening_balances: { Args: { _payload: Json }; Returns: string }
      post_order_replay: { Args: { _id: string }; Returns: undefined }
      post_payment_replay: { Args: { _id: string }; Returns: undefined }
      rebuild_accounting_from_cutoff: { Args: never; Returns: undefined }
      rebuild_accounting_with_summary: { Args: never; Returns: Json }
      recalculate_asset_depreciation: {
        Args: { _asset_id: string; _up_to_month?: string }
        Returns: {
          posted_count: number
          total_amount: number
        }[]
      }
      recompute_expense_lifecycle: {
        Args: { _expense_id: string }
        Returns: undefined
      }
      regenerate_loan_schedule: {
        Args: { _loan_id: string }
        Returns: undefined
      }
      run_depreciation: {
        Args: { _up_to_month?: string }
        Returns: {
          asset_id: string
          posted_count: number
          total_amount: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "cashier"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "cashier"],
    },
  },
} as const
