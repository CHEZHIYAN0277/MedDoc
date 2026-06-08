from datetime import datetime
from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm, inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle, KeepTogether
from reportlab.lib import colors
from reportlab.pdfgen import canvas

from app.models import ReviewFormData


def _draw_header_footer(canvas_obj, doc):
    """Draw header and footer on each page"""
    canvas_obj.saveState()
    
    # Get session_id and approved_at from doc attributes
    session_id = getattr(doc, 'session_id', 'N/A')
    approved_at = getattr(doc, 'approved_at', datetime.utcnow())
    
    # Header
    canvas_obj.setFillColor(colors.HexColor("#1E3A8A"))  # Medical blue
    canvas_obj.rect(0, A4[1] - 30*mm, A4[0], 30*mm, fill=1, stroke=0)
    
    canvas_obj.setFillColor(colors.white)
    canvas_obj.setFont("Times-Bold", 16)
    canvas_obj.drawString(20*mm, A4[1] - 18*mm, "EMERGENCY MEDICAL INTAKE FORM")
    
    canvas_obj.setFont("Times-Roman", 9)
    canvas_obj.drawString(20*mm, A4[1] - 25*mm, "AI-Assisted Documentation System")
    
    # Footer
    canvas_obj.setFillColor(colors.HexColor("#6B7280"))
    canvas_obj.setFont("Times-Roman", 8)
    footer_text = f"Session ID: {session_id} | Approved: {approved_at.strftime('%Y-%m-%d %H:%M UTC')}"
    canvas_obj.drawCentredString(A4[0]/2, 10*mm, footer_text)
    
    canvas_obj.restoreState()


def build_review_pdf(form: ReviewFormData, session_id: str, approved_at: datetime) -> bytes:
    """
    Build a clinician-friendly PDF for a finalized ReviewFormData.
    Modern medical form layout with structured sections and professional formatting.

    The PDF is generated entirely in memory and returned as bytes. It is not
    stored on disk by this function.
    """
    # Use Times family for a clean, clinical look.
    base_font = "Times-Roman"
    heading_font = "Times-Bold"
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=45 * mm,  # Space for header
        bottomMargin=25 * mm,  # Space for footer
    )
    doc.session_id = session_id
    doc.approved_at = approved_at

    styles = getSampleStyleSheet()
    
    # Define styles for medical form
    section_header = ParagraphStyle(
        "SectionHeader",
        parent=styles["Normal"],
        fontName=heading_font,
        fontSize=11,
        leading=14,
        spaceBefore=10,
        spaceAfter=6,
        textColor=colors.HexColor("#1E3A8A"),
        borderWidth=0,
        borderColor=colors.HexColor("#1E3A8A"),
        borderPadding=2,
    )
    
    field_label = ParagraphStyle(
        "FieldLabel",
        parent=styles["Normal"],
        fontName=heading_font,
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#374151"),
    )
    
    field_value = ParagraphStyle(
        "FieldValue",
        parent=styles["Normal"],
        fontName=base_font,
        fontSize=9,
        leading=11,
        textColor=colors.black,
    )
    
    body_text = ParagraphStyle(
        "BodyText",
        parent=styles["Normal"],
        fontName=base_font,
        fontSize=9,
        leading=12,
        textColor=colors.black,
    )

    elements = []
    
    # Status badge at top
    status_data = [
        ["STATUS: CLINICIAN APPROVED", f"Date: {approved_at.strftime('%Y-%m-%d %H:%M UTC')}"],
    ]
    status_table = Table(status_data, colWidths=[100*mm, 55*mm])
    status_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#10B981")),  # Green
        ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#F3F4F6")),
        ("TEXTCOLOR", (0, 0), (0, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, -1), heading_font),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D5DB")),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(status_table)
    elements.append(Spacer(1, 8))

    # Section 1: Patient Identification (Form-style)
    elements.append(Paragraph("1. PATIENT IDENTIFICATION", section_header))
    
    patient_table_data = [
        ["Patient Name:", form.patientName or "_________________", "Age:", form.age or "____", "Gender:", form.gender or "____"],
    ]
    patient_table = Table(
        patient_table_data,
        colWidths=[35*mm, 45*mm, 20*mm, 25*mm, 20*mm, 20*mm],
        hAlign="LEFT",
    )
    patient_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), base_font),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 0), (0, 0), heading_font),  # Labels bold
        ("FONTNAME", (2, 0), (2, 0), heading_font),
        ("FONTNAME", (4, 0), (4, 0), heading_font),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#9CA3AF")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D5DB")),
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#F9FAFB")),
        ("BACKGROUND", (2, 0), (2, 0), colors.HexColor("#F9FAFB")),
        ("BACKGROUND", (4, 0), (4, 0), colors.HexColor("#F9FAFB")),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(patient_table)
    elements.append(Spacer(1, 6))

    # Section 2: Chief Complaint & History
    elements.append(Paragraph("2. CHIEF COMPLAINT & HISTORY OF PRESENT ILLNESS", section_header))
    
    cc_table_data = [
        ["Chief Complaint:", form.chiefComplaint or "_________________"],
        ["Time of Onset:", form.timeOfOnset or "_________________"],
    ]
    cc_table = Table(cc_table_data, colWidths=[40*mm, 115*mm])
    cc_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), base_font),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 0), (-1, 0), heading_font),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#9CA3AF")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D5DB")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F9FAFB")),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(cc_table)
    elements.append(Spacer(1, 4))
    
    hpi_table_data = [
        ["History of Present Illness:", form.presentIllness or "________________________________________________________________________________"],
    ]
    hpi_table = Table(hpi_table_data, colWidths=[40*mm, 115*mm])
    hpi_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), base_font),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 0), (0, 0), heading_font),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#9CA3AF")),
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#F9FAFB")),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(hpi_table)
    elements.append(Spacer(1, 6))

    # Section 3: Consciousness & Neurological Status
    elements.append(Paragraph("3. CONSCIOUSNESS & NEUROLOGICAL STATUS", section_header))
    
    consciousness = form.consciousnessLevel or "_________________"
    orient_person = "☑ Yes" if form.orientationPerson else "☐ No"
    orient_place = "☑ Yes" if form.orientationPlace else "☐ No"
    orient_time = "☑ Yes" if form.orientationTime else "☐ No"
    
    neuro_table_data = [
        ["Level of Consciousness:", consciousness],
        ["Orientation:", f"Person: {orient_person}  Place: {orient_place}  Time: {orient_time}"],
    ]
    neuro_table = Table(neuro_table_data, colWidths=[45*mm, 110*mm])
    neuro_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), base_font),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 0), (-1, 0), heading_font),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#9CA3AF")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D5DB")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F9FAFB")),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(neuro_table)
    elements.append(Spacer(1, 6))

    # Section 4: Medical History & Medications
    elements.append(Paragraph("4. RELEVANT MEDICAL HISTORY & MEDICATIONS", section_header))
    
    history_table_data = [
        ["Known Medical Conditions:", form.knownConditions or "None"],
        ["Drug Allergies:", form.drugAllergies or "None"],
        ["Current Medications:", form.currentMedications or "None"],
    ]
    history_table = Table(history_table_data, colWidths=[45*mm, 110*mm])
    history_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), base_font),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 0), (-1, 0), heading_font),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#9CA3AF")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D5DB")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F9FAFB")),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(history_table)
    elements.append(Spacer(1, 6))

    # Section 5: Vital Signs (Grid format)
    elements.append(Paragraph("5. VITAL SIGNS", section_header))
    
    vitals_table_data = [
        ["Parameter", "Value", "Parameter", "Value"],
        ["Blood Pressure", form.bloodPressure or "____/____", "Heart Rate", form.heartRate or "____ bpm"],
        ["Temperature", form.temperature or "____°F", "Respiratory Rate", form.respiratoryRate or "____/min"],
        ["SpO2", form.oxygenSaturation or "____%", "", ""],
    ]
    vitals_table = Table(vitals_table_data, colWidths=[40*mm, 35*mm, 40*mm, 40*mm])
    vitals_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E3A8A")),  # Header blue
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, -1), base_font),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 0), (-1, 0), heading_font),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#9CA3AF")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D5DB")),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(vitals_table)
    elements.append(Spacer(1, 6))

    # Section 6: Clinical Assessment & Plan
    elements.append(Paragraph("6. CLINICAL ASSESSMENT & PLAN", section_header))
    
    assessment_table_data = [
        ["Provisional Diagnosis:", form.provisionalDiagnosis or "_________________"],
        ["Investigations Ordered:", form.investigationsOrdered or "_________________"],
        ["Medications / Interventions:", form.medicationsInterventions or "_________________"],
        ["Disposition:", form.disposition or "_________________"],
    ]
    assessment_table = Table(assessment_table_data, colWidths=[45*mm, 110*mm])
    assessment_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), base_font),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 0), (-1, 0), heading_font),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#9CA3AF")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D5DB")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F9FAFB")),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(assessment_table)
    elements.append(Spacer(1, 6))

    # Section 7: Consent & Legal Documentation
    elements.append(Paragraph("7. CONSENT & LEGAL DOCUMENTATION", section_header))
    
    consent_raw = form.consentObtained or ""
    consent_map = {
        "yes": "☑ Yes  ☐ No",
        "no": "☐ Yes  ☑ No",
        "not-possible": "☐ Yes  ☐ No  ☑ Not Possible (Emergency)",
    }
    consent_display = consent_map.get(consent_raw.lower(), "☐ Yes  ☐ No")
    
    consent_table_data = [
        ["Consent Obtained:", consent_display],
    ]
    if consent_raw.lower() in ("no", "not-possible"):
        consent_table_data.append(["Reason (if not obtained):", form.consentNotObtainedReason or "_________________"])
    consent_table_data.append(["Name of Attendant / Guardian:", form.attendantName or "_________________"])
    
    consent_table = Table(consent_table_data, colWidths=[50*mm, 105*mm])
    consent_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), base_font),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 0), (-1, 0), heading_font),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#9CA3AF")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D5DB")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F9FAFB")),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(consent_table)
    elements.append(Spacer(1, 10))
    
    # Signature line
    signature_table_data = [
        ["Clinician Signature: _________________________", "Date: _______________"],
    ]
    signature_table = Table(signature_table_data, colWidths=[80*mm, 75*mm])
    signature_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), base_font),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
    ]))
    elements.append(signature_table)

    doc.build(elements, onFirstPage=_draw_header_footer, onLaterPages=_draw_header_footer)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes

