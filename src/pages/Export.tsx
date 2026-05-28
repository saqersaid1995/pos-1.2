import SupabaseExporter from "@/components/settings/SupabaseExporter";

export default function Export() {
  return (
    <div className="page-layout" dir="rtl">
      <div className="page-header">
        <div>
          <h1 className="page-title">تصدير البيانات</h1>
          <p className="page-subtitle">صدّر بياناتك من Supabase لاستخدامها في التطبيق المكتبي</p>
        </div>
      </div>
      <div className="max-w-2xl mx-auto w-full">
        <SupabaseExporter />
      </div>
    </div>
  );
}
