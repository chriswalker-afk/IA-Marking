import json
from collections import Counter
from pathlib import Path

BANK = {
'A': '''
Aim and focus | The investigation establishes a clear, focused aim near the beginning. | The intended aim is difficult to identify or is introduced too late. | aim | 4
Aim and focus | The title, aim and central question describe the same investigation. | The title, aim and stated question point towards different investigations. | aim | 4
Aim and focus | The introduction gives the context needed to understand the mathematical purpose. | The introduction contains considerable background material unrelated to the mathematical purpose. | introduction | 4
Aim and focus | The investigation maintains a clear mathematical focus despite its wider context. | Discussion of the real-world context often displaces the mathematical investigation. | focus | 4
Aim and focus | The aim is sufficiently focused to support a coherent exploration. | The aim is broad enough to produce disconnected lines of investigation. | aim | 4
Organisation | The exploration develops logically from the introduction through the mathematics to the conclusion. | The sequence of sections is difficult to follow and does not form a clear mathematical narrative. | structure | 4
Organisation | Each major stage is introduced with a clear reason for undertaking it. | Several mathematical stages are presented without establishing why they are needed. | structure | 4
Organisation | The links between successive mathematical stages are made explicit. | The transitions between mathematical stages are unclear or unexplained. | structure | 4
Organisation | New mathematical representations appear where they support the surrounding discussion. | Graphs, tables or calculations appear as isolated blocks detached from the surrounding explanation. | structure | 4
Organisation | The exploration explains why the approach changes in response to its results. | Changes of method are made without a coherent explanation of how they arose. | structure | 4
Organisation | The report is structured as a connected mathematical exploration rather than a rigid template. | The report follows a generic research-report structure that interrupts the mathematics. | structure | 4
Organisation | Headings support navigation without fragmenting the mathematical argument. | Excessive headings break the exploration into short disconnected sections. | structure | 4
Organisation | Key calculations and their interpretations are presented close together. | Important results are separated from their interpretation by lengthy unrelated material. | structure | 4
Conciseness | Repeated calculations are condensed into representative examples where appropriate. | Essentially identical calculations are repeated without adding mathematical insight. | concise | 5
Conciseness | The discussion is concise and concentrates on material relevant to the stated aim. | Repetition and unnecessary commentary weaken the conciseness of the exploration. | concise | 5
Conciseness | Standard course mathematics is explained at an appropriate level without lengthy textbook digressions. | Lengthy explanations of routine mathematics distract from the investigation. | concise | 5
Conciseness | Technology outputs are selected because they advance the argument. | Screenshots or procedural explanations occupy space without contributing to the investigation. | technology | 5
Conciseness | Essential mathematics remains in the main body and supplemental material is appropriately separated. | Important mathematical reasoning is hidden in appendices and is not accessible in the main argument. | appendix | 5
Conciseness | Appendix material is referenced concisely when it supports the exploration. | Large appendices are included without a clear connection to the mathematical argument. | appendix | 5
Conclusion | The conclusion directly addresses the investigation's stated aim. | The conclusion does not clearly answer the investigation's stated aim. | conclusion | 5
Conclusion | The conclusion synthesises the main mathematical findings rather than listing calculations. | The conclusion largely repeats calculations without drawing them together into an outcome. | conclusion | 5
Conclusion | The conclusion is consistent with the mathematics actually developed. | The conclusion makes claims that are not supported by the preceding investigation. | conclusion | 5
Conclusion | The exploration finishes decisively without starting substantial new mathematics after the conclusion. | Significant new material appears after the conclusion and weakens the overall structure. | conclusion | 5
''',
'B': '''
Variables and units | Variables and parameters are defined clearly when first introduced. | Several variables or parameters are used before their meanings are established. | notation | 5
Variables and units | Variable definitions make sense in the context of the investigation. | Variables are given abstract definitions that do not clarify their real-world meaning. | notation | 5
Variables and units | Relevant units are included consistently in calculations, tables and explanations. | Units are frequently omitted or applied inconsistently. | units | 5
Variables and units | Distinct quantities are represented by appropriately distinct symbols. | Symbols are reused for different quantities, making the mathematics ambiguous. | notation | 5
Variables and units | Uppercase and lowercase notation is used consistently. | Inconsistent capitalisation changes the apparent meaning of mathematical symbols. | notation | 5
Mathematical notation | Mathematical expressions use conventional notation rather than calculator syntax. | Calculator or computer syntax is left in the submitted mathematical expressions. | notation | 6
Mathematical notation | Subscripts, superscripts and function notation are used accurately. | Subscripts, superscripts or function notation are applied inconsistently. | notation | 6
Mathematical notation | Equations and expressions are distinguished and equality symbols are used appropriately. | Equals signs are used for steps that are not mathematically equal. | notation | 6
Mathematical notation | Standard mathematical terminology is used accurately throughout. | Mathematical terms are used with meanings that are imprecise or incorrect. | terminology | 6
Mathematical notation | Different models are given distinct, clearly explained names. | Different model functions are represented by the same unexplained notation. | modelling | 6
Mathematical notation | Derivative and function notation is consistent between stages of the investigation. | Changes between derivative and function notation are not explained. | calculus | 6
Mathematical notation | Advanced notation is used consistently and correctly for the processes shown. | Notation for more advanced processes is inaccurate or ambiguous. | calculus | 6
Graphs and diagrams | Graph axes identify the quantities represented and include appropriate units. | Graph axes lack the labels or units needed to interpret the representation. | graph | 6
Graphs and diagrams | Graph scales and plotted domains are appropriate for the problem. | Graph scales or domains are inappropriate for the represented situation. | graph | 6
Graphs and diagrams | Important graph details remain legible even when an area is enlarged. | Enlarged graph views omit axes, numerical scales or necessary labels. | graph | 6
Graphs and diagrams | Graphs and diagrams are relevant and explained in the accompanying text. | Visual representations are included without explaining their mathematical relevance. | graph | 6
Graphs and diagrams | Table headings clearly identify variables and units. | Tables are missing headings or units needed to interpret their entries. | table | 6
Graphs and diagrams | Equations and mathematical figures are typeset legibly and without distortion. | Mathematical figures or equations are cut off, distorted or difficult to read. | layout | 6
Graphs and diagrams | Captions and their associated figures remain clearly connected. | Figures, captions or important equations are awkwardly separated across pages. | layout | 6
Precision | Exact and approximate values are distinguished appropriately. | Rounded results are repeatedly written as exact equalities. | precision | 7
Precision | Reported precision is appropriate to the accuracy of the underlying data. | Numerical precision suggests greater accuracy than the data justify. | precision | 7
Precision | Rounding conventions are consistent and explained where they affect the results. | Changes in rounding or precision are made without explanation. | precision | 7
Explanation | The meaning of important equations and mathematical quantities is clear to a reader on the same course. | Mathematical symbols and quantities are not explained sufficiently for a reader on the same course. | explanation | 7
Explanation | Mathematical steps are presented symbolically when a verbal description alone would be unclear. | Important transformations are only described in words, leaving the actual mathematics obscure. | explanation | 6
Explanation | Technology results are communicated in a mathematical format that supports understanding. | Unedited technology screenshots substitute for clear mathematical presentation. | technology | 7
''',
'C': '''
Ownership | The student makes independent mathematical decisions that shape the investigation. | The exploration gives little evidence of mathematical decisions made by the student. | decisions | 7
Ownership | The investigation develops from a question or conjecture formulated by the student. | The mathematical direction appears prescribed rather than arising from a question explored by the student. | inquiry | 7
Ownership | The student explains why a particular method was selected from reasonable alternatives. | Methods are applied without evidence of a considered choice between approaches. | decisions | 7
Ownership | The mathematics is adapted to the particular investigation rather than reproduced mechanically. | Established methods are followed mechanically without meaningful adaptation. | adaptation | 7
Ownership | The student's mathematical reasoning is visible within the development of the argument. | The exploration reads largely as a reproduction of external procedures rather than the student's own reasoning. | ownership | 8
Ownership | The student's own decisions influence how the investigation proceeds after results are obtained. | The exploration follows a fixed procedure even when its results suggest another direction. | ownership | 8
Ownership | The student demonstrates engagement with mathematical ideas rather than merely expressing enthusiasm for the topic. | Personal motivation is presented at length but is not developed into mathematical engagement. | engagement | 7
Ownership | Independent mathematical effort is supported by evidence of choices, reasoning and ownership. | Effort or the apparent difficulty of the task is treated as the main evidence of personal engagement. | engagement | 7
Exploration | The student tests an original prediction or conjecture using mathematical evidence. | The exploration contains little evidence of predictions or conjectures being tested. | conjecture | 8
Exploration | Unexpected findings are used to generate further mathematical questions. | Interesting results are reported but do not shape the next stage of the exploration. | inquiry | 8
Exploration | Relevant special cases or extremes are investigated to deepen the mathematical inquiry. | The exploration makes no meaningful attempt to examine potentially revealing special cases. | extension | 8
Exploration | The investigation extends or generalises mathematical findings where this is relevant. | Opportunities for a relevant mathematical extension are not explored. | extension | 8
Exploration | Additional approaches are used because they reveal a genuinely different mathematical perspective. | Additional methods are included without a clear investigative reason. | alternatives | 8
Exploration | The investigation is modified in response to mathematical evidence and findings. | The approach remains unchanged despite results that call its suitability into question. | adaptation | 8
Exploration | A familiar topic is made personal through substantial mathematical decisions. | The topic is familiar and the exploration adds little independent mathematical development. | ownership | 8
Exploration | A student-developed approach makes the investigation more than a standard textbook exercise. | A standard worked example is reproduced with only superficial contextual changes. | ownership | 8
Data and context | The choice of primary or secondary data supports an independent mathematical investigation. | The source of the data does not contribute to any clear independent mathematical decisions. | data | 8
Data and context | The student justifies choices in the design of the data collection or experiment. | The design of the experiment or data collection is not explained as a set of mathematical choices. | data | 8
Data and context | The analysis shows how newly collected data influences subsequent choices. | Primary data is presented as evidence of engagement without showing how it shaped the mathematics. | data | 8
Data and context | Secondary data is used independently and creatively to investigate a personally chosen question. | Secondary data is processed through a standard sequence with little independent interpretation. | data | 8
Data and context | New mathematical techniques are explained and used purposefully in the student's investigation. | Advanced techniques are reproduced without evidence that the student has taken ownership of the mathematics. | advanced | 8
''',
'D': '''
Ongoing reflection | Reflection appears at meaningful points throughout the mathematical development. | Almost all reflection is confined to a short section at the end. | ongoing | 8
Ongoing reflection | Important results are interpreted in terms of the original aim. | Results are reported without exploring what they mean for the investigation's aim. | interpretation | 8
Ongoing reflection | The student distinguishes the numerical result from its mathematical significance. | Numerical findings are restated and treated as reflection without substantive interpretation. | interpretation | 8
Ongoing reflection | The exploration distinguishes what the evidence establishes from what remains uncertain. | The significance of the results is overstated beyond what the mathematics establishes. | evaluation | 8
Ongoing reflection | The plausibility of mathematical conclusions is evaluated in context. | Implausible results are accepted without mathematical scrutiny. | evaluation | 8
Ongoing reflection | Unexpected results are investigated rather than merely noted. | Unexpected findings are acknowledged but their possible mathematical causes are not examined. | evaluation | 9
Ongoing reflection | The suitability of the chosen method is critically evaluated using mathematical evidence. | The method's suitability is assumed rather than evaluated. | methods | 9
Ongoing reflection | The mathematical strengths and weaknesses of the chosen approach are identified. | Reflection consists largely of general observations unrelated to the method used. | methods | 9
Ongoing reflection | The exploration uses reflection to motivate a justified change of method. | Limitations are identified but do not inform the subsequent investigation. | development | 9
Ongoing reflection | A method that fails is analysed to understand the mathematical reason for the outcome. | An unsuccessful method is abandoned without investigating why it failed. | development | 9
Assumptions | Important model assumptions are clearly stated and evaluated. | The assumptions needed for the model are not explicitly considered. | assumptions | 9
Assumptions | The reasonableness of assumptions is discussed in the context of the particular problem. | Model assumptions are listed without examining whether they are realistic. | assumptions | 9
Assumptions | The consequences of changing an important assumption are investigated. | The exploration does not consider whether its conclusions depend strongly on key assumptions. | sensitivity | 9
Assumptions | The analysis distinguishes reliable conclusions from those affected by uncertainty. | Correct calculations are treated as sufficient evidence that the conclusions are reliable. | reliability | 9
Assumptions | Measurement uncertainty or the quality of input data is connected to the reliability of the results. | The effect of data accuracy or measurement uncertainty is not examined. | uncertainty | 9
Assumptions | Important limitations are assessed for their actual effect on the outcome. | A list of generic limitations is provided without establishing their significance. | limitations | 9
Assumptions | Improvements are supported by a clear mathematical reason why they could affect the outcome. | Suggested improvements are vague and their mathematical benefit is not established. | improvements | 10
Assumptions | The exploration considers how rounding or numerical approximation may affect the conclusion. | Potentially important rounding or approximation errors are not considered. | precision | 9
Data and modelling | The consequences of sample size and sampling bias are evaluated where relevant. | The reliability of conclusions is discussed without addressing a potentially biased or small sample. | statistics | 9
Data and modelling | Unusual data values are investigated for their effect on mathematical conclusions. | Potentially influential outliers are ignored or excluded without evaluation. | statistics | 9
Data and modelling | The fit and limitations of the chosen model are considered in its intended domain. | The fitted model is treated as valid without considering domain restrictions or mathematical behaviour. | modelling | 9
Data and modelling | Predictions are assessed against the limitations of the model and available data. | Model predictions are reported without assessing their reliability. | modelling | 9
Data and modelling | Sensitivity to important parameters or inputs is considered where it affects conclusions. | The exploration does not examine how sensitive its findings are to key parameter choices. | modelling | 9
Data and modelling | The basis for comparing two mathematical approaches is explained and evaluated. | Alternative approaches are compared superficially without a meaningful mathematical basis. | modelling | 9
Data and modelling | For piecewise models, the mathematical significance of continuity or smoothness is considered. | The implications of joins in a piecewise model are overlooked. | modelling | 9
Final evaluation | The conclusion evaluates how successfully the original aim was addressed. | The conclusion does not assess whether the investigation actually answered its original aim. | conclusion | 10
Final evaluation | The remaining uncertainty and scope of the conclusions are made clear. | The final conclusion is presented with unwarranted certainty. | conclusion | 10
Final evaluation | Proposed further investigations follow logically from the mathematical findings. | Extensions are listed without explaining how they arise from the results. | extension | 10
Final evaluation | In a pure mathematical exploration, reflection addresses mathematical obstacles and choices. | A pure mathematics exploration offers little evaluation of the mathematical decisions and challenges encountered. | pure | 10
''',
'E': '''
Relevance and level | The chosen mathematics directly advances the stated investigative aim. | Some mathematical techniques add little to the investigation's aim. | relevance | 10
Relevance and level | The mathematics is appropriate to the level and nature of the course. | The exploration relies mainly on mathematics too elementary for the course level. | course | 10
Relevance and level | The investigation prioritises well-understood mathematics over unnecessary complexity. | Advanced techniques are included without a convincing mathematical purpose. | relevance | 10
Relevance and level | The mathematical process involves reasoning rather than repeated formula substitution. | Much of the work consists of substituting into formulas without investigating underlying relationships. | reasoning | 10
Relevance and level | The mathematical content remains central despite an interdisciplinary setting. | Explanations from another subject dominate the actual mathematics. | relevance | 10
Relevance and level | The chosen approach is an efficient and appropriate way to answer the question. | A complicated method is selected despite a simpler equally informative approach. | relevance | 10
Understanding | The student explains why the selected mathematical method is appropriate. | The method is applied without showing why it is appropriate for this problem. | understanding | 11
Understanding | The underlying mathematics is explained rather than represented only by numerical answers. | Correct numerical outputs are presented without enough evidence of conceptual understanding. | understanding | 11
Understanding | Parameters and coefficients are interpreted meaningfully in context. | Model parameters are calculated but their meanings are not explained. | parameters | 11
Understanding | The conditions required for a mathematical procedure are explained and addressed. | An important mathematical condition is assumed or overlooked. | conditions | 11
Understanding | Calculations are connected to the relationships being investigated. | Symbolic manipulations are shown without an explanation of what they establish. | reasoning | 11
Understanding | Mathematical reasoning is sufficiently self-contained for the intended reader. | The explanation depends too heavily on outside sources to make the mathematical reasoning understandable. | explanation | 11
Understanding | Essential unfamiliar techniques are introduced with an explanation of their mathematical basis. | Unfamiliar advanced formulae are used with little explanation of how or why they work. | advanced | 11
Understanding | Representative worked steps or verification demonstrate genuine understanding of the method. | The exploration does not provide sufficient representative working to establish understanding. | working | 11
Understanding | Established methods are developed or adapted rather than simply reproduced from another source. | A substantial section reproduces known mathematics without independent development. | originality | 11
Accuracy | Mathematical operations and results are accurate enough to sustain the conclusions. | Errors in the mathematics compromise important subsequent results. | accuracy | 11
Accuracy | Technology-generated results are checked for plausibility before being used. | Technology-generated outputs are accepted without checking their mathematical plausibility. | technology | 11
Technology | Technology is used efficiently for routine computation so that attention remains on the mathematics. | Lengthy routine calculations crowd out analysis that could have been supported by technology. | technology | 11
Technology | The mathematical meaning of technology outputs is clearly explained. | Technology outputs are copied into the report without interpreting their significance. | technology | 11
Technology | Simulations and coding are connected to the mathematical assumptions and results. | The technical process of coding or simulation replaces the mathematical explanation. | simulation | 11
Data and statistics | The population, sampling unit and selection method are explained sufficiently for the analysis. | The sampling process is not described sufficiently to judge its suitability. | statistics data | 12
Data and statistics | The selected sampling approach is justified in relation to the aim. | The choice of sampling technique is not justified in relation to the investigation. | statistics data | 12
Data and statistics | The sample size and representativeness are considered appropriately. | A sample is treated as representative without mathematical or methodological justification. | statistics data | 12
Data and statistics | The data are explored graphically before a correlation or regression model is chosen. | A regression model is fitted without first examining the shape and spread of the data. | regression statistics | 13
Data and statistics | The interpretation of correlation is correct and distinguishes association from causation. | Correlation is incorrectly used as evidence of a causal relationship. | regression statistics | 13
Data and statistics | The chosen correlation coefficient is appropriate to the data and investigated relationship. | The choice between correlation measures is not justified by the data. | regression statistics | 13
Data and statistics | The meaning of the fitted model or correlation statistic is explained in context. | A correlation or regression statistic is given without an adequate contextual interpretation. | regression statistics | 13
Hypothesis testing | The chosen hypothesis test addresses a specific question arising from the aim. | Statistical testing is included without a clear connection to the investigation's aim. | hypothesis statistics | 13
Hypothesis testing | The assumptions and conditions of the hypothesis test are identified and considered. | The validity conditions for the selected statistical test are not checked. | hypothesis statistics | 13
Hypothesis testing | The hypotheses, test statistic and result are communicated in mathematically appropriate form. | The hypotheses or test result are presented incorrectly or ambiguously. | hypothesis statistics | 13
Hypothesis testing | Statistical conclusions are interpreted accurately without overstating the evidence. | The test conclusion overstates what the p-value or significance result establishes. | hypothesis statistics | 14
Hypothesis testing | Expected frequencies and degrees of freedom are checked before relying on a chi-squared test. | A chi-squared test is used without checking expected frequencies or degrees of freedom. | chi-squared statistics | 14
Hypothesis testing | Category grouping or corrections are justified by the actual requirements of the test. | Categories or continuity corrections are changed mechanically without justification. | chi-squared statistics | 14
Modelling | Candidate model families are chosen for relevant mathematical and contextual reasons. | Candidate functions are selected mainly by trial and error without mathematical justification. | modelling | 14
Modelling | The interpretation of model parameters is linked to the situation being investigated. | Model parameters have no clear interpretation in the original context. | modelling | 15
Modelling | The fitted model is tested against data using suitable graphical or numerical evidence. | A fitted equation is accepted without assessing the quality of the fit. | modelling | 15
Modelling | The choice of model is supported by more than a single goodness-of-fit statistic. | The model is selected exclusively because of a high coefficient of determination. | modelling | 15
Modelling | Residuals or systematic differences are examined where appropriate. | Potential patterns in residuals are ignored when comparing models. | modelling | 15
Modelling | Model domain and range restrictions reflect the context being investigated. | The model is used outside a meaningful domain without mathematical justification. | modelling | 15
Modelling | Extrapolated predictions are distinguished from predictions within the observed data range. | Extrapolation is treated as reliable without considering behaviour beyond the available data. | modelling | 15
Modelling | Model refinements follow from mathematical limitations or evidence. | The final model is selected without addressing limitations identified during fitting. | modelling | 15
Other methods | An optimisation process is developed using mathematics appropriate to the problem. | An optimisation problem is treated as a standard calculation without substantial investigation. | calculus optimisation | 16
Other methods | A pure mathematics topic is investigated through reasoning or proof rather than historical description. | The discussion of a pure topic is descriptive and lacks sufficient mathematical development. | pure | 16
Other methods | The mathematical assumptions of a probability or game model are established clearly. | The model's probability rules or assumptions are insufficiently explained. | probability | 16
Other methods | Geometric construction and interpretation are explained, not merely generated by software. | A geometric diagram is generated by software without adequate mathematical interpretation. | geometry voronoi | 16
Other methods | The simulation's mathematical assumptions and output are linked coherently. | A simulation is presented mainly as code or procedure without mathematical interpretation. | simulation | 16
Higher level | The application demonstrates depth or sophistication appropriate to an HL exploration. | The mathematical application does not demonstrate sufficient depth for an HL exploration. | hl | 4
Higher level | Higher-level mathematical work is supported by accurate, clearly demonstrated reasoning. | The apparent sophistication of the method is not supported by demonstrated mathematical understanding. | hl | 11
Higher level | Advanced modelling is developed rigorously where necessary for the chosen aim. | An advanced model is used without addressing important mathematical justification or conditions. | hl modelling | 11
'''
}

out = []
for criterion, source in BANK.items():
    for raw in source.strip().splitlines():
        raw = raw.strip()
        if not raw:
            continue
        parts = [p.strip() for p in raw.split(' | ')]
        if len(parts) != 5:
            raise ValueError((criterion, raw, len(parts)))
        topic, positive, negative, tags, page = parts
        for sentiment, text in [('strength', positive), ('limitation',negative)]:
            item = {
                'id': f'{criterion}{len(out)+1:03d}',
                'criterion': criterion,
                'tone': sentiment,
                'topic': topic,
                'text': text,
                'tags': tags.split(),
                'sourcePages': [int(page)],
                'courses': ['AA SL','AI SL','AA HL','AI HL'],
                'origin': 'Curated assessment-evidence wording based on 2021-2026 examiner feedback synthesis'
            }
            if topic == 'Higher level':
                item['courses'] = ['AA HL', 'AI HL']
            out.append(item)

root=Path(__file__).parent
(root / 'comments.json').write_text(json.dumps(out, indent=2, ensure_ascii=False) + '\n',encoding='utf-8')
print(f'{len(out)} curated evidence comments: {dict(Counter(x["criterion"] for x in out))}')
print(f'strengths: {sum(x["tone"]=="strength" for x in out)}, limitations: {sum(x["tone"]=="limitation" for x in out)}')