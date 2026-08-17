import io
from fpdf import FPDF
from datetime import datetime

def create_summary_pdf(summary_data: dict, user_name: str = "User") -> io.BytesIO:
    class PDF(FPDF):
        def header(self):
            # Title
            self.set_font("helvetica", "B", 18)
            self.cell(0, 10, "AI Health Intelligence Summary", new_x="LMARGIN", new_y="NEXT", align="C")
            
            # Subtitle
            self.set_font("helvetica", "I", 10)
            self.set_text_color(100, 100, 100)
            date_str = datetime.now().strftime("%B %d, %Y")
            self.cell(0, 8, f"Generated on {date_str} for {user_name}", new_x="LMARGIN", new_y="NEXT", align="C")
            
            # Line break
            self.ln(5)
            # Separator line
            self.set_draw_color(200, 200, 200)
            self.line(10, self.get_y(), 200, self.get_y())
            self.ln(5)

        def footer(self):
            # Position at 1.5 cm from bottom
            self.set_y(-15)
            self.set_font("helvetica", "I", 8)
            self.set_text_color(128, 128, 128)
            
            # Disclaimer
            self.cell(0, 5, "Disclaimer: This summary is AI-generated for informational purposes only.", align="C", new_x="LMARGIN", new_y="NEXT")
            self.cell(0, 5, "Always consult a qualified healthcare provider for medical advice.", align="C", new_x="LMARGIN", new_y="NEXT")
            
            # Page number
            self.cell(0, 5, f"Page {self.page_no()}", align="R")

    pdf = PDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.set_font("helvetica", size=11)
    
    # Helper to add a section with bullet points
    def add_bullet_section(title, items, icon=""):
        if not items:
            return
            
        pdf.set_font("helvetica", "B", 14)
        pdf.set_text_color(40, 40, 40)
        pdf.cell(0, 10, f"{icon} {title}", new_x="LMARGIN", new_y="NEXT")
        
        pdf.set_font("helvetica", "", 11)
        pdf.set_text_color(60, 60, 60)
        for item in items:
            # Bullet point
            pdf.cell(5, 7, "-", align="R")
            # The text (multi-cell handles wrapping)
            pdf.multi_cell(0, 7, item, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)

    # Overall Assessment
    if summary_data.get("overall_assessment"):
        pdf.set_font("helvetica", "B", 14)
        pdf.set_text_color(40, 40, 40)
        pdf.cell(0, 10, "Overall Assessment", new_x="LMARGIN", new_y="NEXT")
        
        pdf.set_font("helvetica", "", 11)
        pdf.set_text_color(60, 60, 60)
        pdf.multi_cell(0, 7, summary_data["overall_assessment"], new_x="LMARGIN", new_y="NEXT")
        pdf.ln(5)

    add_bullet_section("Key Improvements", summary_data.get("key_improvements", []))
    add_bullet_section("Worsening Indicators", summary_data.get("worsening_indicators", []))
    add_bullet_section("Risk Trends", summary_data.get("risk_trends", []))
    add_bullet_section("Important Changes", summary_data.get("important_changes", []))

    # Return as BytesIO
    pdf_buffer = io.BytesIO()
    pdf.output(pdf_buffer)
    pdf_buffer.seek(0)
    
    return pdf_buffer
