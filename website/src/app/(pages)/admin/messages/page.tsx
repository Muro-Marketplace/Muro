"use client";

import AdminPortalLayout from "@/components/AdminPortalLayout";
import MessageInbox from "@/components/MessageInbox";

export default function AdminMessagesPage() {
  return (
    <AdminPortalLayout activePath="/admin/messages">
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl">Support Messages</h1>
        <p className="text-sm text-muted mt-1">Message artists and venues as Wallplace Support</p>
      </div>
      <MessageInbox portalType="admin" portalSlug="wallplace-support" />
    </AdminPortalLayout>
  );
}
