package expo.modules.quickkeypad

import android.app.Activity
import android.app.ActivityOptions
import android.content.Intent
import android.content.res.ColorStateList
import android.database.sqlite.SQLiteDatabase
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.os.Trace
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.graphics.ColorUtils
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.facebook.react.ReactApplication
import java.util.UUID

/**
 * Native amount keypad shared by launcher shortcuts and in-app entry points.
 *
 * The translucent activity supports two modes:
 * - Navigate mode: launcher shortcut confirmation deep-links into the transaction form.
 * - Result mode: in-app callers receive amount and currency through an activity result.
 *
 * Calculator behavior mirrors src/lib/calc.ts using integer cents.
 */
class QuickKeypadActivity : AppCompatActivity() {

    private lateinit var amountText: TextView
    private lateinit var currencySelector: View
    private lateinit var currencySymbol: TextView
    private lateinit var currencyChevron: ImageView
    private lateinit var auxText: TextView
    private lateinit var themePalette: QuickKeypadPalette
    private var expr: String = ""
    private var currency: String = "CNY"
    private var hapticLevel: Int = 1
    private var resultMode: Boolean = false
    private var allowCurrencySelection: Boolean = true
    private var allowZero: Boolean = false
    private var replaceOnNextNumeric: Boolean = false
    private var reactHostPrewarmStartedAt: Long? = null
    private var retainedHandoffId: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        val storedTheme = QuickKeypadThemeStore.read(this)
        if (storedTheme != null) {
            delegate.localNightMode =
                if (storedTheme.isDark) {
                    AppCompatDelegate.MODE_NIGHT_YES
                } else {
                    AppCompatDelegate.MODE_NIGHT_NO
                }
        }
        super.onCreate(savedInstanceState)
        themePalette = storedTheme ?: QuickKeypadThemeStore.fromResources(this)

        resultMode = intent?.getBooleanExtra(EXTRA_RESULT_MODE, false) ?: false
        if (resultMode) {
            configureResultModeOpenTransition()
        } else {
            prewarmReactHost()
        }

        setContentView(R.layout.activity_quick_keypad)

        hapticLevel = readSettingInt("haptic.level", 1)

        // Configure result behavior and optional initial values.
        val initAmt = intent?.getLongExtra(EXTRA_INITIAL_AMOUNT, 0L) ?: 0L
        val initCur = intent?.getStringExtra(EXTRA_INITIAL_CURRENCY)
        allowCurrencySelection =
            intent?.getBooleanExtra(EXTRA_ALLOW_CURRENCY_SELECTION, true) ?: true
        allowZero = intent?.getBooleanExtra(EXTRA_ALLOW_ZERO, false) ?: false
        if (!initCur.isNullOrEmpty()) currency = initCur
        if (savedInstanceState != null) {
            expr = savedInstanceState.getString(STATE_EXPRESSION).orEmpty()
            currency = savedInstanceState.getString(STATE_CURRENCY) ?: currency
            replaceOnNextNumeric =
                savedInstanceState.getBoolean(STATE_REPLACE_ON_NEXT_NUMERIC, expr.isNotEmpty())
        } else {
            if (initAmt != 0L || allowZero) expr = formatCents(initAmt)
            replaceOnNextNumeric = expr.isNotEmpty()
        }

        amountText = findViewById(R.id.amountText)
        currencySelector = findViewById(R.id.currencySelector)
        currencySymbol = findViewById(R.id.currencySymbol)
        currencyChevron = findViewById(R.id.currencyChevron)
        auxText = findViewById(R.id.auxText)

        applyKeypadTheme()

        findViewById<View>(R.id.mask).setOnClickListener { cancel() }
        applyBottomSystemBarInset(findViewById(R.id.keypadPanel))
        currencySelector.isEnabled = allowCurrencySelection
        currencyChevron.visibility = if (allowCurrencySelection) View.VISIBLE else View.GONE
        if (allowCurrencySelection) {
            currencySelector.setOnClickListener { showCurrencyPicker() }
        }

        val keys = mapOf(
            R.id.btnDiv to "÷", R.id.btnMul to "×", R.id.btnAdd to "+", R.id.btnSub to "-",
            R.id.btn1 to "1", R.id.btn2 to "2", R.id.btn3 to "3",
            R.id.btn4 to "4", R.id.btn5 to "5", R.id.btn6 to "6",
            R.id.btn7 to "7", R.id.btn8 to "8", R.id.btn9 to "9",
            R.id.btn0 to "0", R.id.btnDot to ".",
            R.id.btnBack to "⌫",
        )
        keys.forEach { (id, key) ->
            findViewById<Button>(id).setOnClickListener {
                vibrate()
                val next = Calc.applyInput(expr, key, replaceOnNextNumeric)
                expr = next.expression
                replaceOnNextNumeric = next.replaceOnNextNumeric
                updateDisplay()
            }
        }
        findViewById<Button>(R.id.btnC).setOnClickListener {
            vibrate()
            val next = Calc.applyInput(expr, "C", replaceOnNextNumeric)
            expr = next.expression
            replaceOnNextNumeric = next.replaceOnNextNumeric
            updateDisplay()
        }
        findViewById<Button>(R.id.btnOk).setOnClickListener {
            if (retainedHandoffId != null) return@setOnClickListener
            val handoffId = if (resultMode) null else UUID.randomUUID().toString()
            handoffId?.let(QuickAddHandoffController::beginPerformance)
            handoffId?.let(::logReactHostPrewarmStatus)
            Trace.beginSection("QuickAdd/NativeConfirm")
            try {
                vibrate()
                confirm(handoffId)
            } catch (error: Throwable) {
                handoffId?.let {
                    QuickAddHandoffController.cancelPerformance(it, "confirm_error")
                }
                throw error
            } finally {
                Trace.endSection()
            }
        }

        updateDisplay()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString(STATE_EXPRESSION, expr)
        outState.putString(STATE_CURRENCY, currency)
        outState.putBoolean(STATE_REPLACE_ON_NEXT_NUMERIC, replaceOnNextNumeric)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        retainedHandoffId?.let { handoffId ->
            QuickAddHandoffController.sourceDestroyed(this, handoffId)
        }
        super.onDestroy()
    }

    private fun updateDisplay() {
        currencySymbol.text = symbol(currency)
        currencySelector.contentDescription =
            getString(
                if (allowCurrencySelection) {
                    R.string.quick_keypad_currency_select_description
                } else {
                    R.string.quick_keypad_currency_fixed_description
                },
                currency,
            )
        if (expr.isEmpty()) {
            amountText.text = "0.00"
            amountText.setTextColor(themePalette.secondaryText)
            auxText.text = ""
        } else {
            amountText.text = expr
            amountText.setTextColor(themePalette.primary)
            val ev = Calc.eval(expr)
            auxText.text = if (hasPendingOp(expr) && ev != null) "= ${formatCents(ev)}" else ""
        }
    }

    private fun applyKeypadTheme() {
        val panel = findViewById<View>(R.id.keypadPanel)
        panel.background = shapeDrawable(
            themePalette.surface,
            topCornerRadius = dp(16f),
        )

        currencySymbol.setTextColor(themePalette.primary)
        currencyChevron.imageTintList = ColorStateList.valueOf(themePalette.primary)
        auxText.setTextColor(themePalette.secondaryText)
        currencySelector.background = statefulBackground(
            normalColor = Color.TRANSPARENT,
            pressedColor = pressedSurfaceColor(),
            cornerRadius = dp(8f),
        )

        val keyIds = intArrayOf(
            R.id.btnDiv, R.id.btnMul, R.id.btnAdd, R.id.btnSub,
            R.id.btn1, R.id.btn2, R.id.btn3,
            R.id.btn4, R.id.btn5, R.id.btn6,
            R.id.btn7, R.id.btn8, R.id.btn9,
            R.id.btn0, R.id.btnDot, R.id.btnC, R.id.btnBack,
        )
        keyIds.forEach { id ->
            findViewById<Button>(id).apply {
                setTextColor(themePalette.text)
                background = statefulBackground(
                    normalColor = Color.TRANSPARENT,
                    pressedColor = pressedSurfaceColor(),
                )
            }
        }

        findViewById<Button>(R.id.btnOk).apply {
            setTextColor(themePalette.onPrimary)
            background = statefulBackground(
                normalColor = themePalette.primary,
                pressedColor = ColorUtils.blendARGB(themePalette.primary, Color.BLACK, 0.14f),
            )
        }

        applyDividerColors(panel)
    }

    private fun applyDividerColors(view: View) {
        if (view is LinearLayout && view.showDividers != LinearLayout.SHOW_DIVIDER_NONE) {
            view.dividerDrawable = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                setColor(themePalette.border)
                setSize(dp(1f).toInt(), dp(1f).toInt())
            }
        }
        if (view is ViewGroup) {
            for (index in 0 until view.childCount) {
                applyDividerColors(view.getChildAt(index))
            }
        }
    }

    private fun statefulBackground(
        normalColor: Int,
        pressedColor: Int,
        cornerRadius: Float = 0f,
    ): StateListDrawable {
        return StateListDrawable().apply {
            addState(
                intArrayOf(android.R.attr.state_pressed),
                shapeDrawable(pressedColor, cornerRadius),
            )
            addState(
                intArrayOf(android.R.attr.state_focused),
                shapeDrawable(pressedColor, cornerRadius),
            )
            addState(intArrayOf(), shapeDrawable(normalColor, cornerRadius))
        }
    }

    private fun shapeDrawable(
        color: Int,
        cornerRadius: Float = 0f,
        topCornerRadius: Float? = null,
    ): GradientDrawable {
        return GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            setColor(color)
            if (topCornerRadius == null) {
                this.cornerRadius = cornerRadius
            } else {
                cornerRadii = floatArrayOf(
                    topCornerRadius,
                    topCornerRadius,
                    topCornerRadius,
                    topCornerRadius,
                    0f,
                    0f,
                    0f,
                    0f,
                )
            }
        }
    }

    private fun pressedSurfaceColor(): Int {
        return ColorUtils.blendARGB(themePalette.surface, themePalette.text, 0.08f)
    }

    private fun dp(value: Float): Float = value * resources.displayMetrics.density

    private fun applyBottomSystemBarInset(panel: View) {
        val initialLeft = panel.paddingLeft
        val initialTop = panel.paddingTop
        val initialRight = panel.paddingRight
        val initialBottom = panel.paddingBottom
        ViewCompat.setOnApplyWindowInsetsListener(panel) { view, windowInsets ->
            val systemBars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(initialLeft, initialTop, initialRight, initialBottom + systemBars.bottom)
            windowInsets
        }
        ViewCompat.requestApplyInsets(panel)
    }

    private fun showCurrencyPicker() {
        val labels = CURRENCY_CODES.map { "${CURRENCY_SYMBOLS[it] ?: "¥"}  $it" }.toTypedArray()
        val checked = CURRENCY_CODES.indexOf(currency).coerceAtLeast(0)
        AlertDialog.Builder(this)
            .setSingleChoiceItems(labels, checked) { dlg, which ->
                currency = CURRENCY_CODES[which]
                updateDisplay()
                dlg.dismiss()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun cancel() {
        if (resultMode) setResult(RESULT_CANCELED)
        finish()
    }

    private fun confirm(performanceHandoffId: String?) {
        val cents = Calc.eval(expr)
        if (cents == null) {
            performanceHandoffId?.let {
                QuickAddHandoffController.cancelPerformance(it, "invalid_expression")
            }
            return
        }
        if (cents == 0L && !allowZero) {
            performanceHandoffId?.let {
                QuickAddHandoffController.cancelPerformance(it, "zero_not_allowed")
            }
            return
        }
        if (resultMode) {
            val data = Intent().putExtra(RESULT_AMOUNT_CENTS, cents).putExtra(RESULT_CURRENCY, currency)
            setResult(RESULT_OK, data)
            finishWithoutExitTransition()
        } else {
            val type = if (cents < 0) "income" else "expense"
            val amount = Math.abs(cents)
            val handoffId = requireNotNull(performanceHandoffId)
            QuickAddHandoffController.publishLaunch(
                QuickAddHandoffController.QuickAddLaunch(
                    amountCents = amount,
                    currency = currency,
                    type = type,
                    handoffId = handoffId,
                ),
            )
            val uri = Uri.Builder()
                .scheme("finance-tracker")
                .authority("quick-add-transaction")
                .appendQueryParameter("amount", amount.toString())
                .appendQueryParameter("currency", currency)
                .appendQueryParameter("type", type)
                .appendQueryParameter("handoffId", handoffId)
                .build()
            val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TASK,
                )
                setClassName(packageName, "$packageName.MainActivity")
                putExtra(QuickAddHandoffController.EXTRA_HANDOFF_ID, handoffId)
            }
            retainedHandoffId = handoffId
            QuickAddHandoffController.retainSource(this, handoffId)
            launchFreshMainActivity(intent, handoffId)
        }
    }

    private fun launchFreshMainActivity(intent: Intent, handoffId: String) {
        // Rebuilding the standalone quick-add task prevents Android from presenting the
        // previous MainActivity task snapshot before the translucent target window draws.
        window.decorView.postOnAnimation {
            if (retainedHandoffId != handoffId) return@postOnAnimation
            QuickAddHandoffController.beginMainActivityHandoff(handoffId)
            try {
                startActivityWithoutTransition(intent)
            } catch (error: Throwable) {
                Log.e(TAG, "Unable to start MainActivity for handoff $handoffId", error)
                QuickAddHandoffController.cancelLaunch(handoffId, "start_activity_failed")
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun startActivityWithoutTransition(intent: Intent) {
        val options = ActivityOptions.makeCustomAnimation(this, 0, 0)
        startActivity(intent, options.toBundle())
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            overridePendingTransition(0, 0)
        }
    }

    internal fun cancelRetainedHandoff(handoffId: String) {
        if (retainedHandoffId == handoffId) retainedHandoffId = null
    }

    @Suppress("DEPRECATION")
    internal fun finishRetainedHandoff(handoffId: String) {
        if (retainedHandoffId != handoffId) return
        retainedHandoffId = null
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            overrideActivityTransition(Activity.OVERRIDE_TRANSITION_CLOSE, 0, 0)
            finishAndRemoveTask()
        } else {
            finishAndRemoveTask()
            overridePendingTransition(0, 0)
        }
    }

    private fun configureResultModeOpenTransition() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            overrideActivityTransition(
                Activity.OVERRIDE_TRANSITION_OPEN,
                R.anim.slide_up,
                0,
            )
        }
    }

    @Suppress("DEPRECATION")
    private fun finishWithoutExitTransition() {
        // The translucent keypad exit would otherwise obscure the already-launched form for 200 ms.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            overrideActivityTransition(Activity.OVERRIDE_TRANSITION_CLOSE, 0, 0)
            finish()
        } else {
            finish()
            overridePendingTransition(0, 0)
        }
    }

    private fun prewarmReactHost() {
        val reactHost = (application as? ReactApplication)?.reactHost ?: return
        if (reactHost.currentReactContext != null) return

        reactHostPrewarmStartedAt = SystemClock.elapsedRealtime()
        try {
            reactHost.start()
        } catch (error: Throwable) {
            reactHostPrewarmStartedAt = null
            Log.w(PERF_TAG, "phase=react_host_prewarm_failed", error)
        }
    }

    private fun logReactHostPrewarmStatus(handoffId: String) {
        val reactHost = (application as? ReactApplication)?.reactHost
        val startedAt = reactHostPrewarmStartedAt
        val elapsedMs =
            startedAt?.let { SystemClock.elapsedRealtime() - it }
                ?: 0L
        Log.i(
            PERF_TAG,
            "handoffId=$handoffId phase=react_host_prewarm_status " +
                "ready=${reactHost?.currentReactContext != null} elapsedMs=$elapsedMs",
        )
    }

    /** Read an integer setting without opening the database for writes. */
    private fun readSettingInt(key: String, default: Int): Int {
        return try {
            val dbFile = getDatabasePath("finance.db")
            if (dbFile == null || !dbFile.exists()) return default
            SQLiteDatabase.openDatabase(dbFile.path, null, SQLiteDatabase.OPEN_READONLY).use { db ->
                db.rawQuery("SELECT value FROM settings WHERE key = ?", arrayOf(key)).use { cur ->
                    if (cur.moveToFirst()) cur.getString(0)?.toIntOrNull() ?: default else default
                }
            }
        } catch (e: Exception) {
            default
        }
    }

    private fun vibrate() {
        if (hapticLevel <= 0) return
        val vibrator = getSystemService(Vibrator::class.java) ?: return
        val ms = if (hapticLevel >= 2) 28L else 14L
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val amp = if (hapticLevel >= 2) 255 else 90
            vibrator.vibrate(VibrationEffect.createOneShot(ms, amp))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(ms)
        }
    }

    private fun formatCents(cents: Long): String {
        val sign = if (cents < 0) "-" else ""
        val abs = Math.abs(cents)
        val yuan = abs / 100
        val frac = abs % 100
        return "$sign$yuan.${frac.toString().padStart(2, '0')}"
    }

    private fun hasPendingOp(expr: String): Boolean =
        expr.length > 1 && expr.substring(1).any { it in "+-×÷" }

    private fun symbol(code: String): String = CURRENCY_SYMBOLS[code] ?: "¥"

    /** Integer-cents expression evaluator mirroring src/lib/calc.ts. */
    internal object Calc {
        private const val OPS = "+-×÷"
        private fun isOp(ch: Char) = ch in OPS

        data class InputResult(
            val expression: String,
            val replaceOnNextNumeric: Boolean,
        )

        fun applyInput(
            expression: String,
            key: String,
            replaceOnNextNumeric: Boolean,
        ): InputResult {
            if (key == "C") return InputResult("", false)
            if (replaceOnNextNumeric && key.length == 1 && key[0].isDigit()) {
                return InputResult(key, false)
            }
            if (replaceOnNextNumeric && key == ".") {
                return InputResult("0.", false)
            }
            return InputResult(appendKey(expression, key), false)
        }

        fun appendKey(expr: String, key: String): String {
            if (key == "⌫") return if (expr.isEmpty()) expr else expr.dropLast(1)
            if (key.length == 1 && isOp(key[0])) {
                if (expr == "") return if (key == "-") "-" else expr
                if (expr == "-") return expr
                if (expr.endsWith(".")) return expr.dropLast(1) + key
                if (expr.isNotEmpty() && isOp(expr.last())) return expr.dropLast(1) + key
                return expr + key
            }
            val seg = lastSegment(expr)
            if (key == ".") {
                if (seg.contains('.')) return expr
                return if (seg == "" || seg == "-") "${expr}0." else "$expr."
            }
            if (key.length == 1 && key[0].isDigit()) {
                val dot = seg.indexOf('.')
                if (dot >= 0 && seg.length - dot - 1 >= 2) return expr
                return expr + key
            }
            return expr
        }

        private fun lastSegment(expr: String): String {
            for (i in expr.length - 1 downTo 1) {
                if (isOp(expr[i])) return expr.substring(i + 1)
            }
            return expr
        }

        private sealed class Tok {
            class Num(val cents: Long) : Tok()
            class Op(val op: Char) : Tok()
        }

        private fun parseCents(input: String): Long? {
            val s = input.replace(",", "").trim()
            if (s.isEmpty() || s == "-" || s == ".") return null
            val m = Regex("^(-?)(\\d*)(?:\\.(\\d+))?$").matchEntire(s) ?: return null
            val sign = m.groupValues[1]
            val intPart = m.groupValues[2]
            val fracPart = m.groupValues[3]
            if (intPart.isEmpty() && fracPart.isEmpty()) return null
            val whole = if (intPart.isNotEmpty()) intPart.toLong() else 0L
            var cents = whole * 100
            if (fracPart.isNotEmpty()) {
                val frac2 = fracPart.take(2).padEnd(2, '0')
                cents += frac2.toLong()
                if (fracPart.length > 2 && fracPart[2].digitToInt() >= 5) cents += 1
            }
            return if (sign == "-") -cents else cents
        }

        private fun tokenize(expr: String): List<Tok>? {
            val tokens = mutableListOf<Tok>()
            var i = 0
            while (i < expr.length) {
                val ch = expr[i]
                if (isOp(ch) && !(i == 0 && ch == '-')) {
                    tokens.add(Tok.Op(ch)); i++; continue
                }
                var j = if (i == 0 && ch == '-') i + 1 else i
                while (j < expr.length && (expr[j].isDigit() || expr[j] == '.')) j++
                val raw = expr.substring(i, j)
                if (j == i || raw == "-") return null
                val cents = parseCents(raw) ?: return null
                tokens.add(Tok.Num(cents)); i = j
            }
            return tokens
        }

        fun eval(expr: String): Long? {
            var s = expr.trim()
            if (s.endsWith(".")) s = s.dropLast(1)
            while (s.length > 1 && isOp(s.last())) s = s.dropLast(1)
            if (s.isEmpty() || s == "-") return null
            val tokens = tokenize(s) ?: return null
            if (tokens.isEmpty() || tokens.size % 2 == 0) return null
            for (idx in tokens.indices) {
                if ((tokens[idx] is Tok.Num) != (idx % 2 == 0)) return null
            }
            val flat = mutableListOf<Any>()
            var acc = (tokens[0] as Tok.Num).cents
            var k = 1
            while (k < tokens.size) {
                val op = (tokens[k] as Tok.Op).op
                val b = (tokens[k + 1] as Tok.Num).cents
                when (op) {
                    '×' -> acc = Math.round(acc.toDouble() * b / 100)
                    '÷' -> {
                        if (b == 0L) return null
                        acc = Math.round(acc.toDouble() * 100 / b)
                    }
                    else -> { flat.add(acc); flat.add(op); acc = b }
                }
                k += 2
            }
            flat.add(acc)
            var result = flat[0] as Long
            var m = 1
            while (m < flat.size) {
                val op = flat[m] as Char
                val b = flat[m + 1] as Long
                result = if (op == '+') result + b else result - b
                m += 2
            }
            return result
        }
    }

    companion object {
        private const val TAG = "QuickKeypad"
        private const val PERF_TAG = "QuickAddPerf"
        const val EXTRA_RESULT_MODE = "resultMode"
        const val EXTRA_INITIAL_AMOUNT = "initialAmountCents"
        const val EXTRA_INITIAL_CURRENCY = "initialCurrency"
        const val EXTRA_ALLOW_CURRENCY_SELECTION = "allowCurrencySelection"
        const val EXTRA_ALLOW_ZERO = "allowZero"
        const val RESULT_AMOUNT_CENTS = "amountCents"
        const val RESULT_CURRENCY = "currency"
        private const val STATE_EXPRESSION = "quickKeypad.expression"
        private const val STATE_CURRENCY = "quickKeypad.currency"
        private const val STATE_REPLACE_ON_NEXT_NUMERIC = "quickKeypad.replaceOnNextNumeric"

        // Keep this map in sync with src/lib/money.ts.
        private val CURRENCY_SYMBOLS = mapOf(
            "CNY" to "¥", "USD" to "$", "EUR" to "€", "GBP" to "£", "JPY" to "￥",
            "HKD" to "HK$", "TWD" to "NT$", "KRW" to "₩", "SGD" to "S$", "AUD" to "A$", "CAD" to "C$",
        )
        private val CURRENCY_CODES = listOf(
            "CNY", "USD", "EUR", "GBP", "JPY", "HKD", "TWD", "KRW", "SGD", "AUD", "CAD",
        )
    }
}
