-- Tighten RLS policies for go-live
-- Run this in Supabase SQL Editor

-- =============================================
-- ORDERS: Scope reads to buyer's own orders
-- =============================================
DROP POLICY IF EXISTS "Authenticated can read orders" ON orders;
CREATE POLICY "Users can read own orders" ON orders
  FOR SELECT USING (
    buyer_email = (auth.jwt()->>'email')
    OR auth.role() = 'service_role'
  );

-- =============================================
-- ENQUIRIES: Scope reads to sender or target artist
-- =============================================
DROP POLICY IF EXISTS "Authenticated can read enquiries" ON enquiries;
CREATE POLICY "Users can read own enquiries" ON enquiries
  FOR SELECT USING (
    sender_email = (auth.jwt()->>'email')
    OR auth.role() = 'service_role'
  );

-- =============================================
-- MESSAGES: Scope reads to sender or recipient
-- =============================================
DROP POLICY IF EXISTS "Authenticated can read messages" ON messages;
CREATE POLICY "Users can read own messages" ON messages
  FOR SELECT USING (
    sender_id = auth.uid()
    OR auth.role() = 'service_role'
  );

-- Also scope message updates (mark as read) to recipient
DROP POLICY IF EXISTS "Authenticated can update messages" ON messages;
CREATE POLICY "Recipients can update messages" ON messages
  FOR UPDATE USING (
    sender_id = auth.uid()
    OR auth.role() = 'service_role'
  );
